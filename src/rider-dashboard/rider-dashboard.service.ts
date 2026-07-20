import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { ShipmentStatus } from '@prisma/client';

import { PrismaService } from '../providers/database/prisma.service';
import { RiderDashboardOverviewDto } from './dto/dashboard-overview.dto';

@Injectable()
export class RiderDashboardService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async getOverview(
    userId: string,
  ): Promise<RiderDashboardOverviewDto> {
    /**
     * Find Rider
     */
    const rider =
      await this.prisma.riderProfile.findUnique({
        where: {
          userId,
        },
        include: {
          user: true,
        },
      });

    if (!rider) {
      throw new NotFoundException(
        'Rider profile not found.',
      );
    }

    /**
     * Wallet
     */
    const wallet =
      await this.prisma.wallet.findUnique({
        where: {
          userId,
        },
      });


const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0);

const endOfToday = new Date();
endOfToday.setHours(23, 59, 59, 999);

const deliveriesToday =
  await this.prisma.shipment.findMany({
    where: {
      riderId: rider.id,
      status: ShipmentStatus.DELIVERED,
      updatedAt: {
        gte: startOfToday,
        lte: endOfToday,
      },
    },
    select: {
      riderShare: true,
    },
  });

const todaysEarnings =
  deliveriesToday.reduce(
    (total, shipment) =>
      total + Number(shipment.riderShare),
    0,
  );

    /**
     * Pending Wallet
     */
    const pendingWallet = Number(
      wallet?.pendingBalance ?? 0,
    );

    /**
     * Available Jobs
     */
    const availableJobs =
      await this.prisma.shipment.count({
        where: {
          status: ShipmentStatus.PENDING,
          riderId: null,
        },
      });

    /**
     * Recent Deliveries
     */
    const recentDeliveries = (
      await this.prisma.shipment.findMany({
        where: {
          riderId: rider.id,
          status: ShipmentStatus.DELIVERED,
        },
        orderBy: {
          updatedAt: 'desc',
        },
        take: 5,
      })
    ).map((shipment) => ({
      shipmentId: shipment.id,
      trackingCode: shipment.trackingCode,
      recipient: shipment.recipient,
      pickupAddress: shipment.pickupAddress,
      destinationAddress:
        shipment.destinationAddress,
      amountEarned: Number(
        shipment.riderShare,
      ),
      status: shipment.status,
      deliveredAt: shipment.updatedAt,
    }));

    /**
     * Dashboard Response
     */
    return {
      rider: {
        id: rider.user.id,
        firstName: rider.user.firstName,
        lastName: rider.user.lastName,
        email: rider.user.email,
        phoneNumber:
          rider.user.phoneNumber,
        avatarUrl:
          rider.user.avatarUrl,
        isOnline: rider.isOnline,
      },

      statistics: {
        todaysEarnings,
        pendingWallet,
        availableJobs,
        completedDeliveries:
          rider.completedDeliveries,
        riderRating:
          rider.ratingAverage,
      },

      recentDeliveries,
    };
  }
}