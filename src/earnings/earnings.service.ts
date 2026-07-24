import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class RiderEarningsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get Rider Daily Earnings Summary & Target Motivation
   */
  async getDailySummary(riderUserId: string, dailyTarget = 20000) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: riderUserId },
    });

    if (!wallet) {
      throw new NotFoundException('Rider wallet not found.');
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Fetch Today's Earnings from Ledger
    const todayTransactions = await this.prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        type: 'CREDIT',
        category: 'RIDER_EARNINGS',
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    const todayEarnings = todayTransactions.reduce(
      (sum, item) => sum + Number(item.amount),
      0,
    );
    const todayTripsCount = todayTransactions.length;

    // 2. Progress toward target
    const progressPercentage = Math.min(
      100,
      Math.round((todayEarnings / dailyTarget) * 100),
    );
    const remainingToTarget = Math.max(0, dailyTarget - todayEarnings);

    // 3. Dynamic Motivational Message
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
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId: riderUserId },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: riderUserId },
    });

    if (!wallet) {
      throw new NotFoundException('Rider wallet not found.');
    }

    // Get Start and End of Current Week (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 is Sun, 1 is Mon...
    const distanceToMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - distanceToMon);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    // Fetch transactions for the current week
    const transactions = await this.prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        type: 'CREDIT',
        category: 'RIDER_EARNINGS',
        createdAt: {
          gte: startOfWeek,
          lte: endOfWeek,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const completedTrips = await this.prisma.shipment.count({
      where: {
        riderId: rider.id,
        status: 'DELIVERED',
        deliveredAt: {
          gte: startOfWeek,
          lte: endOfWeek,
        },
      },
    });

    const weekGross = transactions.reduce(
      (sum, item) => sum + Number(item.amount),
      0,
    );

    const averagePerTrip = completedTrips > 0 ? weekGross / completedTrips : 0;

    // Populate Daily Weekly Breakdown Chart
    const daysMap = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const chartData = daysMap.map((day) => ({ day, amount: 0 }));

    transactions.forEach((tx) => {
      const txDayIndex = tx.createdAt.getDay();
      // Map JS Sunday(0) to Index 6, Monday(1) to Index 0...
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

    // Attach Daily Target Prompt
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
   * Earnings History
   */
  async getHistory(riderUserId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: riderUserId },
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