import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { TransactionType, LedgerCategory } from '@prisma/client';

export class WalletResponseDto {
  availableBalance!: number;
  pendingBalance!: number;
  currency!: string;
  bankName!: string;
  bankCode!: string;
  accountNumber!: string;
  accountName!: string;
}

@Injectable()
export class MerchantWalletService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveWalletAndBank(userId: string) {
    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found.');
    }

    const [wallet, bankAccount] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.bankAccount.findUnique({ where: { merchantId: merchant.id } }),
    ]);

    if (!bankAccount) {
      throw new BadRequestException('No bank account linked to the merchant profile.');
    }

    return { merchant, wallet, bankAccount };
  }

  async getWalletSummary(userId: string): Promise<WalletResponseDto> {
    const { wallet, bankAccount } = await this.resolveWalletAndBank(userId);

    const availableBalance = wallet ? Number(wallet.availableBalance ?? 0) : 0;
    const pendingBalance = wallet ? Number(wallet.pendingBalance ?? 0) : 0;
    const currency = wallet?.currency || 'NGN';

    return {
      availableBalance,
      pendingBalance,
      currency,
      bankName: bankAccount.bankName,
      bankCode: bankAccount.bankCode || '',
      accountNumber: bankAccount.accountNumber,
      accountName: bankAccount.accountName,
    };
  }

  async getTransactions(userId: string) {
    const { wallet } = await this.resolveWalletAndBank(userId);

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

  async requestWithdrawal(userId: string, amount: number) {
    if (amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be greater than zero.');
    }

    return this.prisma.$transaction(async (tx) => {
      const merchant = await this.prisma.merchantProfile.findUnique({
        where: { userId },
      });

      if (!merchant) {
        throw new NotFoundException('Merchant profile not found.');
      }

      const [wallet, bankAccount] = await Promise.all([
        tx.wallet.findUnique({ where: { userId } }),
        tx.bankAccount.findUnique({ where: { merchantId: merchant.id } }),
      ]);

      if (!wallet) {
        throw new NotFoundException('Wallet not found.');
      }

      if (!bankAccount || !bankAccount.accountNumber) {
        throw new BadRequestException('No valid bank account linked to the merchant profile.');
      }

      const balance = Number(wallet.availableBalance || 0);
      if (amount > balance) {
        throw new BadRequestException('Withdrawal amount exceeds available balance.');
      }

      // Deduct available balance
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: { decrement: amount },
        },
      });

      const referenceCode = `AVR-WDR-${Date.now().toString().slice(-6)}`;

      // Record ledger debit
      const entry = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          type: TransactionType.DEBIT,
          category: LedgerCategory.WITHDRAWAL,
          description: `Instant payout to ${bankAccount.accountNumber} (${bankAccount.bankName})`,
          referenceCode,
          amount,
        },
      });

      return {
        message: 'Withdrawal request submitted successfully.',
        referenceCode: entry.referenceCode,
        amount,
      };
    });
  }
}