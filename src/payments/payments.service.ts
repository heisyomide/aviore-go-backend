import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/send-notification.dto';
import { LedgerCategory } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Get all payments for a customer with summary metrics
   */
  async getPayments(customerId: string) {
    const payments = await this.prisma.payment.findMany({
      where: { customerId },
      include: {
        shipment: {
          select: {
            id: true,
            trackingCode: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalSpent = payments
      .filter((payment) => payment.status === 'SUCCESS')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    return {
      payments,
      summary: {
        totalSpent,
        totalTransactions: payments.length,
        lastPaymentDate: payments.length > 0 ? payments[0].createdAt : null,
      },
    };
  }

  /**
   * Get single payment details
   */
  async getPayment(paymentId: string, customerId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: paymentId,
        customerId,
      },
      include: {
        shipment: {
          select: {
            id: true,
            trackingCode: true,
            pickupAddress: true,
            destinationAddress: true,
            recipient: true,
            recipientPhone: true,
            totalPrice: true,
            createdAt: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  /**
   * Escrow Hold: Confirms payment status for shipment
   */
  async holdEscrow(shipmentId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment || payment.status !== 'SUCCESS') {
      throw new BadRequestException(
        'Payment must be confirmed before locking escrow.',
      );
    }

    return this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'SUCCESS',
      },
    });
  }

  /**
   * Escrow Release: Triggered upon correct delivery PIN verification.
   * Credits rider's wallet & updates transaction ledger.
   */
  async releaseEscrow(shipmentId: string, riderUserId: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { payments: true },
    });

    if (!shipment) {
      throw new NotFoundException('Shipment not found.');
    }

    const successfulPayment = shipment.payments.find(
      (p) => p.status === 'SUCCESS',
    );

    if (!successfulPayment) {
      throw new BadRequestException('No successful payment found for this shipment.');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: riderUserId },
    });

    if (!wallet) {
      throw new NotFoundException('Rider wallet not found.');
    }

    const totalAmount = Number(shipment.totalPrice);
    const riderSharePercentage = 0.8;
    const riderAmount = totalAmount * riderSharePercentage;

    return this.prisma.$transaction(async (tx) => {
      // 1. Credit Rider Wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: { increment: riderAmount },
        },
      });

      // 2. Log Ledger Transaction for Rider
      const transaction = await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: riderAmount,
          type: 'CREDIT',
          category: LedgerCategory.RIDER_EARNINGS, // 👈 Exact enum value
          referenceCode: `EARN-${shipment.trackingCode}`,
          description: `Payout for delivered shipment #${shipment.trackingCode}`,
        },
      });

      // 🔔 Dispatch Notification to Rider
      this.notificationService
        .dispatch({
          type: NotificationType.SYSTEM_ALERT,
          userId: riderUserId,
          title: 'Earnings Credited',
          body: `₦${riderAmount} has been credited to your wallet for completing shipment #${shipment.trackingCode}.`,
          data: { shipmentId, amount: riderAmount },
        })
        .catch((err) => console.error('[NOTIFICATION_ERROR]', err));

      return {
        success: true,
        message: 'Escrow released and rider wallet credited successfully.',
        transaction,
      };
    });
  }

  /**
   * Refund Escrow: Triggered on shipment cancellation before pickup
   */
  async refundEscrow(shipmentId: string, reason: string) {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { payments: true },
    });

    if (!shipment) {
      throw new NotFoundException('Shipment not found.');
    }

    const successfulPayment = shipment.payments.find(
      (p) => p.status === 'SUCCESS',
    );

    if (!successfulPayment) {
      throw new BadRequestException('No successful payment found to refund.');
    }

    await this.prisma.payment.update({
      where: { id: successfulPayment.id },
      data: { status: 'REFUNDED' },
    });

    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: { status: 'CANCELLED' },
    });

    // 🔔 Notify Customer
    if (shipment.customerId) {
      this.notificationService
        .dispatch({
          type: NotificationType.SYSTEM_ALERT,
          userId: shipment.customerId,
          title: 'Shipment Refunded',
          body: `Your payment of ₦${shipment.totalPrice} for shipment #${shipment.trackingCode} has been refunded. Reason: ${reason}`,
          data: { shipmentId },
        })
        .catch((err) => console.error('[NOTIFICATION_ERROR]', err));
    }

    return {
      success: true,
      message: 'Escrow refunded and shipment cancelled successfully.',
    };
  }

  /**
   * Resolve Bank Account Name via Flutterwave
   */
  async resolveBankAccount(accountNumber: string, bankCode: string) {
    const url = 'https://api.flutterwave.com/v3/accounts/resolve';
    const payload = {
      account_number: accountNumber,
      account_bank: bankCode,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      if (response.data?.status === 'success' && response.data?.data) {
        return {
          accountName: response.data.data.account_name,
        };
      }

      throw new BadRequestException(
        'Could not resolve account details with Flutterwave.',
      );
    } catch (error: any) {
      console.error(
        'Flutterwave Lookup Error Exception:',
        error.response?.data || error.message,
      );

      if (error.response?.status === 400 || error.response?.status === 422) {
        throw new BadRequestException(
          error.response?.data?.message ||
            'Invalid account number or bank code combinations.',
        );
      }

      throw new InternalServerErrorException(
        'Flutterwave core clearance connection timeout.',
      );
    }
  }
}