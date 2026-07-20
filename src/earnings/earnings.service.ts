import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class RiderEarningsService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Earnings Dashboard
   */
async getDashboard(riderUserId: string) {
  const rider =
    await this.prisma.riderProfile.findUnique({
      where: {
        userId: riderUserId,
      },
    });

  if (!rider) {
    throw new NotFoundException(
      'Rider profile not found.',
    );
  }

  const wallet =
    await this.prisma.wallet.findUnique({
      where: {
        userId: riderUserId,
      },
    });

  const transactions =
    await this.prisma.transaction.findMany({
      where: {
        walletId: wallet?.id,
        type: 'CREDIT',
        category: 'RIDER_EARNINGS',
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  const completedTrips =
    await this.prisma.shipment.count({
      where: {
        riderId: rider.id,
        status: 'DELIVERED',
      },
    });

  const weekGross = transactions.reduce(
    (sum, item) => sum + Number(item.amount),
    0,
  );

  const averagePerTrip =
    completedTrips > 0
      ? weekGross / completedTrips
      : 0;

  const chart = [
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ].map((day) => ({
    day,
    amount: 0,
  }));

  const history = transactions.map((item) => ({
    id: item.id,
    trackingCode: item.referenceCode,
    customerName: item.description,
    amount: Number(item.amount),
    createdAt: item.createdAt,
    status: 'SETTLED' as const,
  }));

  return {
    overview: {
      weekGross,
      completedTrips,
      activeHours: 0,
      averagePerTrip,
      weekLabel: 'Current Week',
    },

    chart,

    history,
  };
}

  /**
   * Earnings History
   */
  async getHistory(
    riderUserId: string,
  ) {
    const wallet =
      await this.prisma.wallet.findUnique({
        where: {
          userId: riderUserId,
        },
      });

    if (!wallet) {
      return [];
    }

    const history =
      await this.prisma.transaction.findMany({
        where: {
          walletId: wallet.id,
          type: 'CREDIT',
          category: 'RIDER_EARNINGS',
        },

        orderBy: {
          createdAt: 'desc',
        },
      });

    return history.map((item) => ({
      id: item.id,

      reference: item.referenceCode,

      amount: Number(item.amount),

      description: item.description,

      createdAt: item.createdAt,

      type: item.type,

      category: item.category,
    }));
  }
}