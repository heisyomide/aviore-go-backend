import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Wallet Overview
   */
  async getWallet(
    userId: string,
  ) {
    const wallet =
      await this.prisma.wallet.findUnique({
        where: {
          userId,
        },
      });

    if (!wallet) {
      throw new NotFoundException(
        'Wallet not found.',
      );
    }

    const rider =
      await this.prisma.riderProfile.findUnique({
        where: {
          userId,
        },
      });

    if (!rider) {
      throw new NotFoundException(
        'Rider profile not found.',
      );
    }

return {
  availableBalance: wallet.availableBalance,
  pendingBalance: wallet.pendingBalance,
  currency: wallet.currency,

  bank: {
    bankName: rider.bankName,
    bankCode: rider.bankCode,
    accountNumber: rider.accountNumber,
    accountName: rider.accountName,
  },
};
  }

  /**
   * Wallet History
   */
async getTransactionHistory(
  userId: string,
) {
  const wallet =
    await this.prisma.wallet.findUnique({
      where: {
        userId,
      },
    });

  if (!wallet) {
    throw new NotFoundException(
      'Wallet not found.',
    );
  }

  /**
   * Wallet Transactions
   */
  const transactions =
    await this.prisma.transaction.findMany({
      where: {
        walletId: wallet.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  /**
   * Withdrawal History
   */
  const withdrawals =
    await this.prisma.withdrawal.findMany({
      where: {
        walletId: wallet.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

  return {
    transactions: transactions.map((item) => ({
      id: item.id,
      amount: Number(item.amount),
      type: item.type,
      category: item.category,
      description: item.description,
      referenceCode: item.referenceCode,
      createdAt: item.createdAt,
    })),

    withdrawals: withdrawals.map((item) => ({
      id: item.id,
      amount: Number(item.amount),
      status: item.status,
      bankName: item.bankName,
      bankCode: item.bankCode,
      accountNumber: item.accountNumber,
      accountName: item.accountName,
      createdAt: item.createdAt,
    })),
  };
}

  /**
   * Request Withdrawal
   */
  async requestWithdrawal(
    userId: string,
    amount: number,
  ) {
    const wallet =
      await this.prisma.wallet.findUnique({
        where: {
          userId,
        },
      });

    if (!wallet) {
      throw new NotFoundException(
        'Wallet not found.',
      );
    }

    if (
      Number(wallet.availableBalance) <
      amount
    ) {
      throw new BadRequestException(
        'Insufficient wallet balance.',
      );
    }

    const rider =
      await this.prisma.riderProfile.findUnique({
        where: {
          userId,
        },
      });

    if (!rider) {
      throw new NotFoundException(
        'Rider not found.',
      );
    }

    if (
      !rider.bankCode ||
      !rider.accountNumber
    ) {
      throw new BadRequestException(
        'Please add your bank account first.'
      );
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.wallet.update({
          where: {
            id: wallet.id,
          },
          data: {
            availableBalance: {
              decrement: amount,
            },

            pendingBalance: {
              increment: amount,
            },
          },
        });

        if (
  !rider.bankName ||
  !rider.bankCode ||
  !rider.accountNumber ||
  !rider.accountName
) {
  throw new BadRequestException(
    'Please complete your bank details before requesting withdrawal.',
  );
}

        const withdrawal =
          await tx.withdrawal.create({
            data: {
              walletId: wallet.id,
              riderId: rider.id,
              amount,

              bankName:
                rider.bankName,

              bankCode:
                rider.bankCode,

              accountNumber:
                rider.accountNumber,

              accountName:
                rider.accountName,

              status: 'PENDING',
            },
          });

          

        await tx.transaction.create({
          data: {
            walletId: wallet.id,
            amount,

            type: 'DEBIT',

            category:
              'WITHDRAWAL',

            referenceCode: `WD-${Date.now()}`,

            description:
              'Withdrawal request',

          },
        });

        return {
          success: true,

          message:
            'Withdrawal request submitted successfully.',

          withdrawal,
        };
      },
    );
  }
}