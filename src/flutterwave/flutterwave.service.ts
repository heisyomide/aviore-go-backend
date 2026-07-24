import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../providers/database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/send-notification.dto';
import { firstValueFrom } from 'rxjs';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { TransferDto } from './dto/transfer.dto';

@Injectable()
export class FlutterwaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly notificationService: NotificationService, // 👈 Injected
  ) {}

  private get headers() {
    return {
      Authorization: `Bearer ${this.config.get<string>('FLW_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Initialize Payment Link for Customer Shipment
   */
  async initializePayment(dto: InitializePaymentDto) {
    const txRef = `AV-${Date.now()}`;

    const payload = {
      tx_ref: txRef,
      amount: dto.amount,
      currency: 'NGN',
      redirect_url: dto.redirectUrl,
      customer: {
        email: dto.email,
        name: dto.customerName,
        phonenumber: dto.phone,
      },
      customizations: {
        title: 'Aviorè Go',
        description: 'Shipment Payment',
        logo: 'https://yourdomain.com/logo.png',
      },
      meta: {
        shipmentId: dto.shipmentId,
      },
    };

    try {
      const response = await firstValueFrom(
        this.http.post(
          'https://api.flutterwave.com/v3/payments',
          payload,
          { headers: this.headers },
        ),
      );

      await this.prisma.payment.create({
        data: {
          shipmentId: dto.shipmentId,
          customerId: dto.customerId,
          txRef,
          amount: dto.amount,
          currency: 'NGN',
          gateway: 'FLUTTERWAVE',
          status: 'PENDING',
        },
      });

      return response.data;
    } catch (error: any) {
      throw new InternalServerErrorException(
        error.response?.data?.message ??
          error.response?.data ??
          error.message ??
          'Flutterwave initialization failed',
      );
    }
  }

  /**
   * Verify Payment Status
   */
  async verifyPayment(transactionId: string) {
    try {
      const response = await firstValueFrom(
        this.http.get(
          `https://api.flutterwave.com/v3/transactions/${transactionId}/verify`,
          { headers: this.headers },
        ),
      );

      const paymentData = response.data.data;
      const isSuccessful = paymentData.status === 'successful';

      const updatedPayment = await this.prisma.payment.update({
        where: {
          txRef: paymentData.tx_ref,
        },
        data: {
          status: isSuccessful ? 'SUCCESS' : 'FAILED',
          flutterwaveTxId: String(paymentData.id),
          flutterwaveRef: paymentData.flw_ref,
        },
      });

      // 🔔 Dispatch Notification if payment succeeded
      if (isSuccessful && updatedPayment.customerId) {
        this.notificationService
          .dispatch({
            type: NotificationType.PAYMENT_RECEIPT,
            userId: updatedPayment.customerId,
            title: 'Payment Successful',
            body: `Your payment of ₦${paymentData.amount} was confirmed successfully.`,
            data: {
              paymentId: updatedPayment.id,
              shipmentId: updatedPayment.shipmentId,
            },
          })
          .catch((err) => console.error('[NOTIFICATION_ERROR]', err));
      }

      return paymentData;
    } catch (error) {
      throw new BadRequestException('Payment verification failed');
    }
  }

  /**
   * Initiate Bank Transfer / Payout
   */
  async withdraw(dto: TransferDto) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: dto.riderId },
    });

    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }

    const flwReference = `WD-${Date.now()}`;

    const payload = {
      account_bank: dto.accountBank,
      account_number: dto.accountNumber,
      amount: dto.amount,
      currency: 'NGN',
      narration: dto.narration || 'Aviorè Go Payout',
      reference: flwReference,
      callback_url: dto.callbackUrl,
      debit_currency: 'NGN',
    };

    try {
      const response = await firstValueFrom(
        this.http.post(
          'https://api.flutterwave.com/v3/transfers',
          payload,
          { headers: this.headers },
        ),
      );

      const withdrawal = await this.prisma.withdrawal.create({
        data: {
          walletId: wallet.id,
          riderId: dto.riderId,
          amount: dto.amount,
          bankName: dto.bankName,
          bankCode: dto.accountBank,
          accountNumber: dto.accountNumber,
          accountName: dto.accountName,
          flutterwaveReference: flwReference,
          flutterwaveId: String(response.data.data.id),
          status: 'PENDING',
        },
      });

      // 🔔 Dispatch Notification
      this.notificationService
        .dispatch({
          type: NotificationType.WITHDRAWAL_UPDATE,
          userId: dto.riderId,
          title: 'Payout Processing',
          body: `Your withdrawal of ₦${dto.amount} to ${dto.bankName} (${dto.accountNumber}) has been initiated via Flutterwave.`,
          data: { withdrawalId: withdrawal.id },
        })
        .catch((err) => console.error('[NOTIFICATION_ERROR]', err));

      return response.data;
    } catch (error: any) {
      throw new InternalServerErrorException(
        error.response?.data?.message ?? 'Withdrawal request failed',
      );
    }
  }

  /**
   * Fetch Nigerian Bank List
   */
  async getBanks() {
    try {
      const response = await firstValueFrom(
        this.http.get('https://api.flutterwave.com/v3/banks/NG', {
          headers: this.headers,
        }),
      );
      return response.data;
    } catch (error: any) {
      throw new BadRequestException('Unable to fetch banks');
    }
  }

  /**
   * Resolve Bank Account Name
   */
  async resolveAccount(bankCode: string, accountNumber: string) {
    try {
      const response = await firstValueFrom(
        this.http.post(
          'https://api.flutterwave.com/v3/accounts/resolve',
          {
            account_number: accountNumber,
            account_bank: bankCode,
          },
          { headers: this.headers },
        ),
      );
      return response.data;
    } catch (error: any) {
      throw new BadRequestException(
        error.response?.data?.message ?? 'Account resolution failed',
      );
    }
  }

  /**
   * Handle Webhook Events from Flutterwave
   */
  async handleWebhook(signature: string, payload: any) {
    const secretHash = this.config.get<string>('FLW_SECRET_HASH');

    // 1. Verify webhook signature
    if (!signature || signature !== secretHash) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const { event, data } = payload;

    // 2. Handle Transfer (Withdrawal) Events
    if (event === 'transfer.completed') {
      const withdrawal = await this.prisma.withdrawal.findFirst({
        where: { flutterwaveReference: data.reference },
      });

      if (!withdrawal) {
        return { status: 'Ignored: Withdrawal not found' };
      }

      if (data.status === 'SUCCESS') {
        await this.prisma.$transaction(async (tx) => {
          // Update Withdrawal status
          await tx.withdrawal.update({
            where: { id: withdrawal.id },
            data: { status: 'SUCCESS' },
          });

          // Decrement pending balance
          await tx.wallet.update({
            where: { id: withdrawal.walletId },
            data: {
              pendingBalance: { decrement: withdrawal.amount },
            },
          });
        });

        // 🔔 Notify Rider
        this.notificationService
          .dispatch({
            type: NotificationType.WITHDRAWAL_UPDATE,
            userId: withdrawal.riderId,
            title: 'Withdrawal Completed',
            body: `Your payout of ₦${withdrawal.amount} to ${withdrawal.bankName} has been completed successfully.`,
            data: { withdrawalId: withdrawal.id },
          })
          .catch((err) => console.error('[NOTIFICATION_ERROR]', err));
      } else if (data.status === 'FAILED') {
        await this.prisma.$transaction(async (tx) => {
          // Update Withdrawal status
          await tx.withdrawal.update({
            where: { id: withdrawal.id },
            data: { status: 'FAILED' },
          });

          // Reverse pending balance back to available balance
          await tx.wallet.update({
            where: { id: withdrawal.walletId },
            data: {
              pendingBalance: { decrement: withdrawal.amount },
              availableBalance: { increment: withdrawal.amount },
            },
          });
        });

        // 🔔 Notify Rider
        this.notificationService
          .dispatch({
            type: NotificationType.WITHDRAWAL_UPDATE,
            userId: withdrawal.riderId,
            title: 'Withdrawal Failed',
            body: `Your withdrawal request of ₦${withdrawal.amount} failed and funds have been returned to your available balance.`,
            data: { withdrawalId: withdrawal.id },
          })
          .catch((err) => console.error('[NOTIFICATION_ERROR]', err));
      }
    }

    // 3. Handle Charge/Payment Events (Optional redundant safety check)
    if (event === 'charge.completed' && data.status === 'successful') {
      const payment = await this.prisma.payment.findUnique({
        where: { txRef: data.tx_ref },
      });

      if (payment && payment.status === 'PENDING') {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'SUCCESS',
            flutterwaveTxId: String(data.id),
            flutterwaveRef: data.flw_ref,
          },
        });
      }
    }

    return { status: 'success' };
  }
}