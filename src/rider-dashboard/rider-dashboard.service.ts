import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class RiderDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(userId: string) {
    if (!userId) {
      throw new BadRequestException('User ID is missing from Auth Token');
    }

    // 1. Fetch Rider Profile with User relation
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
      include: {
        user: true,
      },
    });

    if (!rider || !rider.user) {
      throw new NotFoundException('Rider profile or associated user record not found.');
    }

    // 2. Standard UTC bounds for "Today"
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const endOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    );

    // 3. Execute DB queries
    const [wallet, todaysEarningsResult, availableJobsCount, recentDeliveries] =
      await Promise.all([
        // Query A: Wallet balance
        this.prisma.wallet.findUnique({
          where: { userId },
          select: { pendingBalance: true },
        }),

        // Query B: Today's Earnings
        this.prisma.shipment.aggregate({
          where: {
            riderId: rider.id,
            status: ShipmentStatus.DELIVERED,
            updatedAt: {
              gte: startOfToday,
              lte: endOfToday,
            },
          },
          _sum: {
            riderShare: true,
          },
        }),

        // Query C: Count Available Jobs ONLY if rider is ONLINE
        rider.isOnline
          ? this.prisma.shipment.count({
              where: {
                status: ShipmentStatus.PENDING,
                riderId: null,
              },
            })
          : Promise.resolve(0), // 👈 Returns 0 jobs when offline!

        // Query D: Recent Deliveries
        this.prisma.shipment.findMany({
          where: {
            riderId: rider.id,
            status: ShipmentStatus.DELIVERED,
          },
          select: {
            id: true,
            trackingCode: true,
            recipient: true,
            pickupAddress: true,
            destinationAddress: true,
            riderShare: true,
            status: true,
            updatedAt: true,
          },
          orderBy: {
            updatedAt: 'desc',
          },
          take: 5,
        }),
      ]);

    const todaysEarnings = Number(todaysEarningsResult._sum.riderShare ?? 0);
    const pendingWallet = Number(wallet?.pendingBalance ?? 0);

    // Handle name field fallbacks in case User model stores full name or separate first/last name
    const firstName = rider.user.firstName || (rider.user as any).name?.split(' ')[0] || 'Rider';
    const lastName = rider.user.lastName || (rider.user as any).name?.split(' ')[1] || '';

    return {
      rider: {
        id: rider.user.id,
        firstName,
        lastName,
        email: rider.user.email,
        phoneNumber: rider.user.phoneNumber,
        avatarUrl: rider.user.avatarUrl,
        isOnline: rider.isOnline,
      },

      statistics: {
        todaysEarnings,
        pendingWallet,
        availableJobs: rider.isOnline ? availableJobsCount : 0, // 👈 Safe check
        completedDeliveries: rider.completedDeliveries ?? 0,
        riderRating: rider.ratingAverage ?? 5.0,
      },

      recentDeliveries: recentDeliveries.map((shipment) => ({
        shipmentId: shipment.id,
        trackingCode: shipment.trackingCode,
        recipient: shipment.recipient,
        pickupAddress: shipment.pickupAddress,
        destinationAddress: shipment.destinationAddress,
        amountEarned: Number(shipment.riderShare ?? 0),
        status: shipment.status,
        deliveredAt: shipment.updatedAt,
      })),
    };
  }
}