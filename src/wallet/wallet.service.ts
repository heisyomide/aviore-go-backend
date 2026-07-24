import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../providers/database/prisma.service';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/dto/send-notification.dto';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Wallet Overview
   */
  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found.');
    }

    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
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
  async getTransactionHistory(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found.');
    }

    const transactions = await this.prisma.transaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
    });

    const withdrawals = await this.prisma.withdrawal.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
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
  async requestWithdrawal(userId: string, amount: number) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found.');
    }

    if (Number(wallet.availableBalance) < amount) {
      throw new BadRequestException('Insufficient wallet balance.');
    }

    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
    });

    if (!rider) {
      throw new NotFoundException('Rider not found.');
    }

    // Extract & destructure fields to enforce string types (narrowing nullability)
    const { bankName, bankCode, accountNumber, accountName } = rider;

    if (!bankName || !bankCode || !accountNumber || !accountName) {
      throw new BadRequestException(
        'Please complete your bank details before requesting withdrawal.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: { decrement: amount },
          pendingBalance: { increment: amount },
        },
      });

      const withdrawal = await tx.withdrawal.create({
        data: {
          walletId: wallet.id,
          riderId: rider.id,
          amount,
          bankName,       // 👈 Strictly 'string'
          bankCode,       // 👈 Strictly 'string'
          accountNumber,  // 👈 Strictly 'string'
          accountName,    // 👈 Strictly 'string'
          status: 'PENDING',
        },
      });

      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount,
          type: 'DEBIT',
          category: 'WITHDRAWAL',
          referenceCode: `WD-${Date.now()}`,
          description: 'Withdrawal request',
        },
      });

      return withdrawal;
    });

    // 🔔 Send push/in-app notification to the rider
    this.notificationService
      .dispatch({
        type: NotificationType.WITHDRAWAL_UPDATE,
        userId,
        title: 'Withdrawal Requested',
        body: `Your withdrawal request of ₦${amount} to ${bankName} (${accountNumber}) has been received and is processing.`,
        data: { withdrawalId: result.id, amount },
      })
      .catch((err) => console.error('[NOTIFICATION_ERROR]', err));

    return {
      success: true,
      message: 'Withdrawal request submitted successfully.',
      withdrawal: result,
    };
  }
}