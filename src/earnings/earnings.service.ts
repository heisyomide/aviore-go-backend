import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class RiderEarningsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper: Get West Africa Time (WAT, UTC+1) bounds for a target date
   */
  private getLocalDayBounds(targetDate: Date = new Date()) {
    // Shift the timestamp by +1 hour for WAT (UTC+1) offset calculation
    const watTimeOffset = 1 * 60 * 60 * 1000;
    const localCurrent = new Date(targetDate.getTime() + watTimeOffset);

    const startOfLocalDay = new Date(localCurrent);
    startOfLocalDay.setUTCHours(0, 0, 0, 0);

    const endOfLocalDay = new Date(localCurrent);
    endOfLocalDay.setUTCHours(23, 59, 59, 999);

    return {
      startOfDay: new Date(startOfLocalDay.getTime() - watTimeOffset),
      endOfDay: new Date(endOfLocalDay.getTime() - watTimeOffset),
    };
  }

  /**
   * Helper: Get West Africa Time (WAT, UTC+1) current week bounds (Monday to Sunday)
   */
  private getLocalWeekBounds() {
    const watTimeOffset = 1 * 60 * 60 * 1000;
    const localNow = new Date(Date.now() + watTimeOffset);
    const dayOfWeek = localNow.getUTCDay(); // 0 is Sun, 1 is Mon...
    const distanceToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const startOfLocalWeek = new Date(localNow);
    startOfLocalWeek.setUTCDate(localNow.getUTCDate() - distanceToMon);
    startOfLocalWeek.setUTCHours(0, 0, 0, 0);

    const endOfLocalWeek = new Date(startOfLocalWeek);
    endOfLocalWeek.setUTCDate(startOfLocalWeek.getUTCDate() + 6);
    endOfLocalWeek.setUTCHours(23, 59, 59, 999);

    return {
      startOfWeek: new Date(startOfLocalWeek.getTime() - watTimeOffset),
      endOfWeek: new Date(endOfLocalWeek.getTime() - watTimeOffset),
    };
  }

  /**
   * Get Rider Daily Earnings Summary & Target Motivation
   */
  async getDailySummary(riderUserId: string, dailyTarget = 20000) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: riderUserId },
      select: { id: true, availableBalance: true },
    });

    if (!wallet) {
      throw new NotFoundException('Rider wallet not found.');
    }

    const { startOfDay, endOfDay } = this.getLocalDayBounds();

    // Fetch aggregated earnings and transaction count concurrently using database indexes
    const [aggregation, todayTripsCount] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          walletId: wallet.id,
          type: 'CREDIT',
          category: 'RIDER_EARNINGS',
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
        _sum: { amount: true },
      }),
      this.prisma.transaction.count({
        where: {
          walletId: wallet.id,
          type: 'CREDIT',
          category: 'RIDER_EARNINGS',
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
    ]);

    const todayEarnings = Number(aggregation._sum.amount ?? 0);
    const progressPercentage = Math.min(
      100,
      Math.round((todayEarnings / dailyTarget) * 100),
    );
    const remainingToTarget = Math.max(0, dailyTarget - todayEarnings);

    // Dynamic Motivational Message
    let promptMessage = '';
    if (todayEarnings === 0) {
      promptMessage = `Ready to start today's hustle? Complete deliveries to reach your ₦${dailyTarget.toLocaleString()} target!`;
    } else if (todayEarnings >= dailyTarget) {
      promptMessage = `🔥 Awesome! You've reached your daily target of ₦${dailyTarget.toLocaleString()} with ₦${todayEarnings.toLocaleString()} earned today! Want to keep going for extra cash?`;
    } else {
      promptMessage = `Great work! You've earned ₦${todayEarnings.toLocaleString()} across ${todayTripsCount} delivery${todayTripsCount > 1 ? 's' : ''} today. Only ₦${remainingToTarget.toLocaleString()} left to hit your ₦${dailyTarget.toLocaleString()} goal!`;
    }

    return {
      todayEarnings,
      todayTripsCount,
      dailyTarget,
      progressPercentage,
      remainingToTarget,
      promptMessage,
      availableBalance: Number(wallet.availableBalance),
    };
  }

  /**
   * Full Earnings Dashboard with Weekly Breakdown Chart & History
   */
async getDashboard(riderUserId: string) {
    const [rider, existingWallet] = await Promise.all([
      this.prisma.riderProfile.findUnique({
        where: { userId: riderUserId },
        select: { id: true },
      }),
      this.prisma.wallet.findUnique({
        where: { userId: riderUserId },
        select: { id: true, availableBalance: true },
      }),
    ]);

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
    }

    // Defensive Auto-Provisioning: Fixes missing wallets instantly on-the-fly
let wallet = existingWallet;
    if (!wallet) {
      wallet = await this.prisma.wallet.create({
        data: {
          userId: riderUserId,
          availableBalance: 0,
        },
        select: { id: true, availableBalance: true },
      });
    }

    const { startOfWeek, endOfWeek } = this.getLocalWeekBounds();

    // Fetch weekly transactions and completed trips count in parallel
    const [transactions, completedTrips] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          walletId: wallet.id,
          type: 'CREDIT',
          category: 'RIDER_EARNINGS',
          createdAt: { gte: startOfWeek, lte: endOfWeek },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          referenceCode: true,
          description: true,
          createdAt: true,
        },
      }),
      this.prisma.shipment.count({
        where: {
          riderId: rider.id,
          status: 'DELIVERED',
          deliveredAt: { gte: startOfWeek, lte: endOfWeek },
        },
      }),
    ]);

    const weekGross = transactions.reduce(
      (sum, item) => sum + Number(item.amount),
      0,
    );

    const averagePerTrip = completedTrips > 0 ? weekGross / completedTrips : 0;

    // Populate Daily Weekly Breakdown Chart
    const daysMap = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const chartData = daysMap.map((day) => ({ day, amount: 0 }));

    transactions.forEach((tx) => {
      // Adjust Day Index evaluation based on WAT offset
      const watTimeOffset = 1 * 60 * 60 * 1000;
      const localTxDate = new Date(tx.createdAt.getTime() + watTimeOffset);
      const txDayIndex = localTxDate.getUTCDay();
      
      const mappedIndex = txDayIndex === 0 ? 6 : txDayIndex - 1;
      chartData[mappedIndex].amount += Number(tx.amount);
    });

    const history = transactions.map((item) => ({
      id: item.id,
      trackingCode: item.referenceCode,
      customerName: item.description,
      amount: Number(item.amount),
      createdAt: item.createdAt,
      status: 'SETTLED' as const,
    }));

    const dailySummary = await this.getDailySummary(riderUserId);

    return {
      overview: {
        weekGross,
        completedTrips,
        activeHours: 0,
        averagePerTrip,
        weekLabel: 'Current Week',
      },
      dailySummary,
      chart: chartData,
      history,
    };
  }

  /**
   * Earnings History with optional pagination
   */
  async getHistory(riderUserId: string, limit = 50, offset = 0) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: riderUserId },
      select: { id: true },
    });

    if (!wallet) {
      return [];
    }

    const history = await this.prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        type: 'CREDIT',
        category: 'RIDER_EARNINGS',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        referenceCode: true,
        amount: true,
        description: true,
        createdAt: true,
        type: true,
        category: true,
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