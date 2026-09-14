import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class MerchantWalletService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveWallet(userId: string) {
    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found.');
    }

    const wallet = await this.prisma.wallet.findFirst({
      where: {
        OR: [
          { userId },
          // fallback query matching relation fields if schema uses userId/merchant relations
        ],
      },
    });

    return { merchant, wallet };
  }

  async getWalletSummary(userId: string) {
    const { wallet } = await this.resolveWallet(userId);

    const availableBalance = wallet ? Number(wallet.availableBalance ?? 0) : 0;
    const pendingBalance = wallet ? Number(wallet.pendingBalance ?? 0) : 0;

    if (!wallet) {
      return {
        availableBalance: 0,
        todayEarnings: 0,
        earningsGrowth: '+0%',
        pendingBalance: 0,
        totalEarned: 0,
      };
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayTransactions = await this.prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        type: 'CREDIT',
        createdAt: { gte: startOfToday },
      },
    });

    const todayEarnings = todayTransactions.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const allCredits = await this.prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        type: 'CREDIT',
      },
    });

    const totalEarned = allCredits.reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    return {
      availableBalance,
      todayEarnings,
      earningsGrowth: '+0%',
      pendingBalance,
      totalEarned,
    };
  }

  async getTransactions(userId: string) {
    const { wallet } = await this.resolveWallet(userId);

    if (!wallet) {
      return [];
    }

    const transactions = await this.prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return transactions.map((tx) => {
      const dateObj = new Date(tx.createdAt);
      return {
        id: tx.id,
        type: tx.type,
        category: tx.category || 'GENERAL',
        description: tx.description || `${tx.type} transaction`,
        referenceCode: tx.referenceCode || tx.id,
        date: `${dateObj.toLocaleDateString()} ${dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        amount: Number(tx.amount || 0),
      };
    });
  }
}