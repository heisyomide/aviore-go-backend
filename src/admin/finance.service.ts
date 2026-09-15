import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { FlutterwaveService } from '../flutterwave/flutterwave.service';
import { WithdrawalStatus, TransactionType, Withdrawal } from '@prisma/client';

type WithdrawalWithRelations = Withdrawal & {
  wallet?: {
    id: string;
    pendingBalance: any;
    availableBalance: any;
    user?: {
      firstName: string | null;
      lastName: string | null;
      merchantProfile?: { businessName: string | null } | null;
      riderProfile?: { accountName: string | null } | null;
    } | null;
  } | null;
  merchant?: { businessName: string | null } | null;
  rider?: { accountName: string | null } | null;
};

@Injectable()
export class AdminFinanceService {
  private readonly logger = new Logger(AdminFinanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flutterwaveService: FlutterwaveService,
  ) {}

  private formatCurrency(val: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(val);
  }

private resolveBeneficiaryName(w: WithdrawalWithRelations): string {
    const userObj = w.wallet?.user;
    const merchantObj = w.merchant || userObj?.merchantProfile;
    const riderObj = w.rider || userObj?.riderProfile;

    if (merchantObj?.businessName) {
      return `${merchantObj.businessName} [Merchant]`;
    }
    // Check if account name/metadata hints at business or if user is merchant type
    if ((w as any).metadata?.businessName) {
      return `${(w as any).metadata.businessName} [Merchant]`;
    }
    if (riderObj?.accountName) {
      return `${riderObj.accountName} [Rider]`;
    }
    if (w.accountName) {
      return `${w.accountName} [Account]`;
    }
    if (userObj) {
      const fullName = `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim();
      if (fullName) return `${fullName} [User]`;
    }
    return `Beneficiary (${w.id.slice(0, 6)})`;
}
  async getFinanceOverview() {
    const [txVolume, pendingPayouts] = await Promise.all([
      this.prisma.transaction.aggregate({
        _sum: { amount: true },
        where: { type: TransactionType.CREDIT },
      }),
      this.prisma.withdrawal.aggregate({
        _sum: { amount: true },
        where: { status: WithdrawalStatus.PENDING },
      }),
    ]);

    const totalVolume = Number(txVolume._sum.amount || 0);
    const platformFees = totalVolume * 0.05;
    const pendingVal = Number(pendingPayouts._sum.amount || 0);

    return [
      { label: 'Total Volume', value: this.formatCurrency(totalVolume) },
      { label: 'Platform Fees', value: this.formatCurrency(platformFees) },
      { label: 'Pending Payouts', value: this.formatCurrency(pendingVal) },
    ];
  }

  async getRecentTransactions() {
    const txs = await this.prisma.transaction.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        wallet: {
          include: {
            user: {
              include: { merchantProfile: true },
            },
          },
        },
      },
    });

    return txs.map((t) => {
      const userObj = t.wallet?.user;
      const merchantObj = userObj?.merchantProfile;
      const displayName = merchantObj?.businessName
        ? `${merchantObj.businessName} (Merchant)`
        : userObj
        ? `${userObj.firstName || ''} ${userObj.lastName || ''}`.trim()
        : 'System Account';

      const isCredit = t.type === TransactionType.CREDIT;
      return {
        id: t.id,
        reference: t.referenceCode || `TXN-${t.id.slice(0, 6).toUpperCase()}`,
        user: displayName,
        amount: `${isCredit ? '+' : '-'}₦${Number(t.amount).toLocaleString()}`,
        isCredit,
      };
    });
  }

  async getPendingWithdrawals() {
    const list = (await this.prisma.withdrawal.findMany({
      where: { status: WithdrawalStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      include: {
        wallet: {
          include: {
            user: {
              include: {
                merchantProfile: true,
                riderProfile: true,
              },
            },
          },
        },
        merchant: true,
        rider: true,
      },
    })) as WithdrawalWithRelations[];

    return list.map((w) => {
      const timeDifference = Date.now() - new Date(w.createdAt).getTime();
      const hoursAgo = Math.floor(timeDifference / (1000 * 60 * 60));

      return {
        id: w.id,
        user: this.resolveBeneficiaryName(w),
        amount: `₦${Number(w.amount).toLocaleString()}`,
        date: hoursAgo <= 0 ? 'Just now' : `${hoursAgo} hrs ago`,
        bankName: w.bankName,
        accountNumber: w.accountNumber,
      };
    });
  }

  async approveWithdrawal(withdrawalId: string, adminUserId: string) {
    const withdrawal = await this.prisma.$transaction(async (tx) => {
      const payout = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
        include: {
          wallet: {
            include: { user: { include: { merchantProfile: true } } },
          },
        },
      });

      if (!payout) throw new NotFoundException('WITHDRAWAL_NOT_FOUND');
      if (payout.status !== WithdrawalStatus.PENDING) {
        throw new BadRequestException('WITHDRAWAL_ALREADY_PROCESSED');
      }
      if (!payout.bankCode || !payout.accountNumber) {
        throw new BadRequestException('BANK_DETAILS_MISSING');
      }
      if (!payout.wallet) {
        throw new NotFoundException('WALLET_NOT_FOUND_FOR_WITHDRAWAL');
      }

      const pendingBalance = Number(payout.wallet.pendingBalance || 0);
      const payoutAmount = Number(payout.amount);

      if (pendingBalance < payoutAmount) {
        throw new BadRequestException('INSUFFICIENT_PENDING_ESCROW');
      }

      await tx.wallet.update({
        where: { id: payout.walletId },
        data: { pendingBalance: { decrement: payoutAmount } },
      });

      return tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: WithdrawalStatus.PROCESSING,
          approvedBy: adminUserId,
        },
      });
    });

    const fallbackRef = `WD-${Date.now()}-${withdrawal.id.slice(0, 6)}`;
    const referenceCode = withdrawal.flutterwaveReference || fallbackRef;

    try {
      const walletRecord = await this.prisma.wallet.findUnique({
        where: { id: withdrawal.walletId },
        include: { user: { include: { merchantProfile: true } } },
      });
      const merchantObj = walletRecord?.user?.merchantProfile;
      const narrationLabel = merchantObj?.businessName
        ? `Aviorè Merchant Payout (${merchantObj.businessName})`
        : `Aviorè Payout`;

      const transferPayload = {
        account_bank: withdrawal.bankCode,
        account_number: withdrawal.accountNumber,
        amount: Number(withdrawal.amount),
        currency: 'NGN',
        narration: narrationLabel,
        reference: referenceCode,
      };

      this.logger.log(`🚀 INITIATING FLUTTERWAVE PAYOUT FOR ID: ${withdrawal.id}`);
      const transferResponse = await this.flutterwaveService.initiateTransfer(transferPayload);
      this.logger.log('✅ RAW FLUTTERWAVE TRANSFER RESPONSE:', JSON.stringify(transferResponse, null, 2));

      const transferId =
        transferResponse?.data?.id ||
        transferResponse?.id ||
        transferResponse?.data?.data?.id;

      if (!transferId) {
        throw new Error(`Flutterwave tracking ID missing in response payload: ${JSON.stringify(transferResponse)}`);
      }

      return await this.prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            walletId: withdrawal.walletId,
            amount: withdrawal.amount,
            type: TransactionType.DEBIT,
            category: 'WITHDRAWAL',
            referenceCode,
            description: `Disbursed by Admin (${adminUserId}) via Flutterwave`,
          },
        });

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
      const rawErrorMsg = error.response?.data?.message || error.message || 'Unknown gateway error';

      this.logger.error(`🚨 FLUTTERWAVE PAYOUT DISPATCH FAILED FOR [${withdrawal.id}]:`, {
        message: rawErrorMsg,
        response: error.response?.data,
        status: error.response?.status,
      });

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
        this.logger.log(`🔄 Successfully rolled back state for failed payout: ${withdrawal.id}`);
      } catch (rollbackError: any) {
        this.logger.error(`🔥 CRITICAL ROLLBACK FAILURE FOR [${withdrawal.id}]:`, rollbackError.message);
      }

      throw new InternalServerErrorException(`PAYOUT_FAILED: ${rawErrorMsg}`);
    }
  }

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