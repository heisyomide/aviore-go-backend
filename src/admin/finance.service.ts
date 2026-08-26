import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';
import { WithdrawalStatus, TransactionType } from '@prisma/client';

@Injectable()
export class AdminFinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwaveService: FlutterwaveService,
  ) {}

  /**
   * 1. GET AGGREGATED FINANCE STATS & METRICS
   */
  async getFinanceOverview() {
    const txVolume = await this.prisma.transaction.aggregate({
      _sum: { amount: true },
      where: { type: TransactionType.CREDIT },
    });

    const pendingPayouts = await this.prisma.withdrawal.aggregate({
      _sum: { amount: true },
      where: { status: WithdrawalStatus.PENDING },
    });

    const totalVolume = Number(txVolume._sum.amount || 0);
    const platformFees = totalVolume * 0.05; // 5% flat metric calculation
    const pendingVal = Number(pendingPayouts._sum.amount || 0);

    const formatCurrency = (val: number) =>
      new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 0,
      }).format(val);

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
            user: true,
          },
        },
      },
    });

    return txs.map((t) => ({
      id: t.id,
      reference: t.referenceCode || `TXN-${t.id.slice(0, 6).toUpperCase()}`,
      user: t.wallet?.user
        ? `${t.wallet.user.firstName || ''} ${t.wallet.user.lastName || ''}`.trim()
        : 'System Account',
      amount: `${t.type === TransactionType.CREDIT ? '+' : '-'}₦${Number(t.amount).toLocaleString()}`,
      isCredit: t.type === TransactionType.CREDIT,
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
          include: { user: true },
        },
      },
    });

    return list.map((w) => {
      const timeDifference = Date.now() - new Date(w.createdAt).getTime();
      const hoursAgo = Math.floor(timeDifference / (1000 * 60 * 60));

      return {
        id: w.id,
        user: w.wallet?.user
          ? `${w.wallet.user.firstName || ''} ${w.wallet.user.lastName || ''}`.trim()
          : 'Unknown Fleet Operator',
        amount: `₦${Number(w.amount).toLocaleString()}`,
        date: hoursAgo <= 0 ? 'Just now' : `${hoursAgo} hrs ago`,
      };
    });
  }

  /**
   * 4. MUTATION EXECUTOR: APPROVE WITHDRAWAL
   */
  async approveWithdrawal(withdrawalId: string, adminUserId: string) {
    // =========================================================================
    // PHASE 1: Atomic Database Verification, Balance Check & State Lock
    // =========================================================================
    const withdrawal = await this.prisma.$transaction(async (tx) => {
      const payout = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
        include: { wallet: { include: { user: true } } },
      });

      if (!payout) {
        throw new NotFoundException('WITHDRAWAL_NOT_FOUND');
      }
      if (payout.status !== WithdrawalStatus.PENDING) {
        throw new BadRequestException('WITHDRAWAL_ALREADY_PROCESSED');
      }

      if (!payout.bankCode || !payout.accountNumber) {
        throw new BadRequestException('BANK_DETAILS_MISSING');
      }

      const pendingBalance = Number(payout.wallet.pendingBalance);
      const payoutAmount = Number(payout.amount);

      if (pendingBalance < payoutAmount) {
        throw new BadRequestException('INSUFFICIENT_PENDING_ESCROW');
      }

      // Safely decrement the wallet pending balance inside the lock
      await tx.wallet.update({
        where: { id: payout.walletId },
        data: { pendingBalance: { decrement: payoutAmount } },
      });

      // Transition withdrawal state to PROCESSING
      return tx.withdrawal.update({
        where: { id: withdrawalId },
        data: { 
          status: WithdrawalStatus.PROCESSING, 
          approvedBy: adminUserId 
        },
      });
    });

    // Generate reference code safely
    const fallbackRef = `WD-${Date.now()}-${withdrawal.id.slice(0, 6)}`;
    const referenceCode = withdrawal.flutterwaveReference || fallbackRef;

    // =========================================================================
    // PHASE 2: Live External Gateway Transfer Engine (Flutterwave)
    // =========================================================================
    try {
      console.log(`🚀 INITIATING FLUTTERWAVE PAYOUT FOR ID: ${withdrawal.id}`, {
        amount: Number(withdrawal.amount),
        account_number: withdrawal.accountNumber,
        account_bank: withdrawal.bankCode,
        reference: referenceCode,
      });

      const transferResponse = await this.flutterwaveService.initiateTransfer({
        account_bank: withdrawal.bankCode,
        account_number: withdrawal.accountNumber,
        amount: Number(withdrawal.amount),
        currency: 'NGN',
        narration: `Aviorè Rider Payout`,
        reference: referenceCode,
      });

      console.log('✅ FLUTTERWAVE TRANSFER RESPONSE:', transferResponse);

      const transferId = transferResponse?.data?.id || transferResponse?.id;
      if (!transferId) {
        throw new Error('Flutterwave tracking parameter declaration missing or empty');
      }

      // =========================================================================
      // PHASE 3: Commit Successful External State & Audit Ledger
      // =========================================================================
      return await this.prisma.$transaction(async (tx) => {
        // Create matching ledger debit entry
        await tx.transaction.create({
          data: {
            walletId: withdrawal.walletId,
            amount: withdrawal.amount,
            type: TransactionType.DEBIT,
            category: 'WITHDRAWAL',
            referenceCode: referenceCode,
            description: `Disbursed by Admin (${adminUserId}) via Flutterwave`,
          },
        });

        // Mark withdrawal completely successful
        return tx.withdrawal.update({
          where: { id: withdrawalId },
          data: {
            status: WithdrawalStatus.SUCCESS,
            flutterwaveId: String(transferId),
            approvedAt: new Date(),
            completedAt: new Date(),
          },
        });
      });

    } catch (error: any) {
      // Capture the exact API error details returned by Flutterwave if available
      const rawErrorMsg = error.response?.data?.message || error.message || 'Unknown gateway error';
      
      console.error(`🚨 FLUTTERWAVE PAYOUT DISPATCH FAILED FOR [${withdrawal.id}]:`, {
        message: rawErrorMsg,
        response: error.response?.data,
        status: error.response?.status,
      });

      // Safe Rollback Recovery: Restore internal wallet balance and revert status to PENDING
      try {
        await this.prisma.$transaction([
          this.prisma.wallet.update({
            where: { id: withdrawal.walletId },
            data: { pendingBalance: { increment: Number(withdrawal.amount) } },
          }),
          this.prisma.withdrawal.update({
            where: { id: withdrawalId },
            data: { status: WithdrawalStatus.PENDING },
          }),
        ]);
        console.log(`🔄 successfully rolled back state for failed payout: ${withdrawal.id}`);
      } catch (rollbackError: any) {
        console.error(`🔥 CRITICAL ROLLBACK FAILURE FOR [${withdrawal.id}]:`, rollbackError.message);
      }

      // Bubble up readable error to the frontend UI
      throw new InternalServerErrorException(`PAYOUT_FAILED: ${rawErrorMsg}`);
    }
  }

  /**
   * 5. MUTATION EXECUTOR: REJECT WITHDRAWAL
   */
  async rejectWithdrawal(withdrawalId: string, adminUserId: string) {
    const payout = await this.prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: { wallet: true },
    });

    if (!payout) throw new NotFoundException('Withdrawal entry tracking ID not found.');
    if (payout.status !== WithdrawalStatus.PENDING) {
      throw new BadRequestException('This financial line item request has already been processed.');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: payout.walletId },
        data: {
          pendingBalance: { decrement: payout.amount },
          availableBalance: { increment: payout.amount },
        },
      });

      return tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.FAILED,
          approvedBy: adminUserId,
          approvedAt: new Date(),
          completedAt: new Date(),
        },
      });
    });
  }
}