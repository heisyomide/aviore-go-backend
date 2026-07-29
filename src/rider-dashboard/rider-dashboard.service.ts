import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../providers/database/prisma.service';
import { RiderDashboardOverviewDto } from './dto/dashboard-overview.dto';

@Injectable()
export class RiderDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    userId: string,
  ): Promise<RiderDashboardOverviewDto> {
    // 1. Fetch Rider Profile with User details first
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
      include: {
        user: true,
      },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
    }

    // 2. Define standard UTC bounds for "Today"
    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
    );
    const endOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
    );

    // 3. Execute all independent data fetches concurrently
    const [wallet, todaysEarningsResult, availableJobsCount, recentDeliveries] =
      await Promise.all([
        // Query A: Fetch Wallet
        this.prisma.wallet.findUnique({
          where: { userId },
          select: { pendingBalance: true },
        }),

        // Query B: Aggregate Today's Earnings directly in DB engine
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

        // Query C: Count Available Jobs
        this.prisma.shipment.count({
          where: {
            status: ShipmentStatus.PENDING,
            riderId: null,
          },
        }),

        // Query D: Fetch Recent Deliveries with selective fields
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

    // 4. Extract aggregated earnings safely
    const todaysEarnings = Number(todaysEarningsResult._sum.riderShare ?? 0);
    const pendingWallet = Number(wallet?.pendingBalance ?? 0);

    // 5. Map recent deliveries response payload
    const formattedRecentDeliveries = recentDeliveries.map((shipment) => ({
      shipmentId: shipment.id,
      trackingCode: shipment.trackingCode,
      recipient: shipment.recipient,
      pickupAddress: shipment.pickupAddress,
      destinationAddress: shipment.destinationAddress,
      amountEarned: Number(shipment.riderShare ?? 0),
      status: shipment.status,
      deliveredAt: shipment.updatedAt,
    }));

    // 6. Return Dashboard Overview Response
    return {
      rider: {
        id: rider.user.id,
        firstName: rider.user.firstName,
        lastName: rider.user.lastName,
        email: rider.user.email,
        phoneNumber: rider.user.phoneNumber,
        avatarUrl: rider.user.avatarUrl,
        isOnline: rider.isOnline,
      },

      statistics: {
        todaysEarnings,
        pendingWallet,
        availableJobs: availableJobsCount,
        completedDeliveries: rider.completedDeliveries,
        riderRating: rider.ratingAverage,
      },

      recentDeliveries: formattedRecentDeliveries,
    };
  }
}