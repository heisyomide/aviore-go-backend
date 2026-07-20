import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { WithdrawalStatus, TransactionType, LedgerCategory } from '@prisma/client';

@Injectable()
export class AdminFinanceService {
  constructor(private prisma: PrismaService) {}

  /**
   * 1. GET AGGREGATED FINANCE STATS & METRICS
   */
  async getFinanceOverview() {
    // Calculate total transactional flow volume
    const txVolume = await this.prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: TransactionType.CREDIT }
    });

    // Calculate total pending escrow allocation holds
    const pendingPayouts = await this.prisma.withdrawal.aggregate({
      _sum: { amount: true },
      where: { status: WithdrawalStatus.PENDING }
    });

    const totalVolume = Number(txVolume._sum.amount || 0);
    const platformFees = totalVolume * 0.05; // 5% flat metric calculation
    const pendingVal = Number(pendingPayouts._sum.amount || 0);

    const formatCurrency = (val: number) => 
      new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(val);

    return [
      { label: 'Total Volume', value: formatCurrency(totalVolume) },
      { label: 'Platform Fees', value: formatCurrency(platformFees) },
      { label: 'Pending Payouts', value: formatCurrency(pendingVal) },
    ];
  }

  /**
   * 2. GET IMMUTABLE TRANSACTION HISTORICAL DATA
   */
  async getRecentTransactions() {
    const txs = await this.prisma.transaction.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        wallet: {
          include: {
            user: true
          }
        }
      }
    });

    return txs.map(t => ({
      id: t.id,
      reference: t.referenceCode || `TXN-${t.id.slice(0,6).toUpperCase()}`,
      user: t.wallet?.user ? `${t.wallet.user.firstName || ''} ${t.wallet.user.lastName || ''}`.trim() : 'System Account',
      amount: `${t.type === TransactionType.CREDIT ? '+' : '-'}₦${Number(t.amount).toLocaleString()}`,
      isCredit: t.type === TransactionType.CREDIT
    }));
  }

  /**
   * 3. GET ALL PENDING WITHDRAWALS
   */
  async getPendingWithdrawals() {
    const list = await this.prisma.withdrawal.findMany({
      where: { status: WithdrawalStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      include: {
        wallet: {
          include: { user: true }
        }
      }
    });

    return list.map(w => {
      const timeDifference = Date.now() - new Date(w.createdAt).getTime();
      const hoursAgo = Math.floor(timeDifference / (1000 * 60 * 60));
      
      return {
        id: w.id,
        user: w.wallet?.user ? `${w.wallet.user.firstName || ''} ${w.wallet.user.lastName || ''}`.trim() : 'Unknown Fleet Operator',
        amount: `₦${Number(w.amount).toLocaleString()}`,
        date: hoursAgo <= 0 ? 'Just now' : `${hoursAgo} hrs ago`
      };
    });
  }

  /**
   * 4. MUTATION EXECUTOR: APPROVE WITHDRAWAL
   */
  async approveWithdrawal(withdrawalId: string, adminUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      const payout = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
        include: { wallet: true }
      });

      if (!payout) throw new NotFoundException('Withdrawal entry tracking ID not found.');
      if (payout.status !== WithdrawalStatus.PENDING) {
        throw new BadRequestException('This financial line item request has already been processed.');
      }

      const balanceValue = typeof (payout.wallet.pendingBalance as any).toNumber === 'function'
        ? (payout.wallet.pendingBalance as any).toNumber()
        : Number(payout.wallet.pendingBalance);

      const payoutValue = typeof (payout.amount as any).toNumber === 'function'
        ? (payout.amount as any).toNumber()
        : Number(payout.amount);

      if (balanceValue < payoutValue) {
        throw new BadRequestException('Insufficient pending escrow settlement allocations.');
      }

      const updatedWallet = await tx.wallet.update({
        where: { id: payout.walletId },
        data: {
          pendingBalance: { decrement: payout.amount }
        }
      });

      await tx.transaction.create({
        data: {
          walletId: payout.walletId,
          amount: payout.amount,
          type: TransactionType.DEBIT,
          category: LedgerCategory.WITHDRAWAL,
          referenceCode: `AVIORE-WD-SECURE-${Date.now()}-${withdrawalId}`,
          description: `Disbursed out successfully via Admin validation. Verified by Admin ref: ${adminUserId}`,
          WithdrawalId: withdrawalId
        }
      });

      return tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.SUCCESS,
          approvedBy: adminUserId,
          approvedAt: new Date(),
          completedAt: new Date()
        }
      });
    }, {
      isolationLevel: 'Serializable'
    });
  }

  /**
   * 5. MUTATION EXECUTOR: REJECT WITHDRAWAL
   */
  async rejectWithdrawal(withdrawalId: string, adminUserId: string) {
    const payout = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: { wallet: true }
    });

    if (!payout) throw new NotFoundException('Withdrawal entry tracking ID not found.');
    if (payout.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException('This financial line item request has already been processed.');
    }

    // Return the pending balance value safely to standard available status balance
    return this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: payout.walletId },
        data: {
          pendingBalance: { decrement: payout.amount },
          availableBalance: { increment: payout.amount }
        }
      });

      return tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.FAILED,
          approvedBy: adminUserId,
          approvedAt: new Date(),
          completedAt: new Date()
        }
      });
    });
  }
}