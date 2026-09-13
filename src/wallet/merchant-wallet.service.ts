import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class MerchantWalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getWalletSummary(userId: string) {
    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found.');
    }

    // Fetch the actual wallet tied to the merchant user
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    const availableBalance = wallet ? Number(wallet.availableBalance) : 0;
    const pendingBalance = wallet ? Number(wallet.pendingBalance) : 0;

    // Calculate today's earnings from the transaction table or orders
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayTransactions = wallet ? await this.prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        type: 'CREDIT',
        createdAt: { gte: startOfToday },
      },
    }) : [];

    const todayEarnings = todayTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);

    // Total earned can be calculated from all credit transactions
    const allCredits = wallet ? await this.prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
        type: 'CREDIT',
      },
    }) : [];

    const totalEarned = allCredits.reduce((sum, tx) => sum + Number(tx.amount), 0);

    return {
      availableBalance,
      todayEarnings,
      earningsGrowth: '+0%',
      pendingBalance,
      totalEarned,
    };
  }

  async getTransactions(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      return [];
    }

    const transactions = await this.prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return transactions.map((tx) => ({
      id: tx.id,
      type: tx.type,
      category: tx.category,
      description: tx.description,
      referenceCode: tx.referenceCode,
      date: new Date(tx.createdAt).toLocaleDateString() + ' ' + new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      amount: Number(tx.amount),
    }));
  }
}