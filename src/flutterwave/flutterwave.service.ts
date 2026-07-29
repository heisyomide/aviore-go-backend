import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../providers/database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/send-notification.dto';
import { DispatchService } from '../dispatch/dispatch.service';
import { ShipmentStatus } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { TransferDto } from './dto/transfer.dto';
import { randomUUID } from 'crypto';
import axios from 'axios';

@Injectable()
export class FlutterwaveService {
  private readonly logger = new Logger(FlutterwaveService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly http: HttpService,
    private readonly notificationService: NotificationService,
    private readonly dispatchService: DispatchService,
  ) {}

  /**
   * Helper: Retrieve and sanitize Flutterwave Secret Key from Config or env
   */
  private getSecretKey(): string {
    const key =
      this.config.get<string>('FLW_SECRET_KEY') || process.env.FLW_SECRET_KEY;

    if (!key) {
      this.logger.error('❌ FLW_SECRET_KEY is missing in backend environment!');
      throw new InternalServerErrorException(
        'Payment service configuration missing key',
      );
    }

    // Clean any quotes or accidental spaces
    return key.replace(/['"]/g, '').trim();
  }

  /**
   * Centralized HTTP headers builder
   */
  private get headers() {
    return {
      Authorization: `Bearer ${this.getSecretKey()}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Helper: Activates shipment and dispatches to riders after verified payment
   */
  private async activateAndDispatchShipment(shipmentId: string) {
    if (!shipmentId) return;

    const currentShipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!currentShipment || currentShipment.status !== ShipmentStatus.PENDING) {
      return;
    }

    const updatedShipment = await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: ShipmentStatus.PENDING,
        timelineEvents: {
          create: {
            status: ShipmentStatus.PENDING,
            description:
              'Payment verified successfully. Shipment dispatched to nearby drivers.',
            changedBy: 'SYSTEM',
          },
        },
      },
    });

    try {
      await this.dispatchService.dispatchShipment(updatedShipment);
    } catch (err) {
      this.logger.error('[DISPATCH_ERROR_AFTER_PAYMENT]', err);
    }
  }

  /**
   * Initialize Payment Link for Customer Shipment
   */
  async initializePayment(dto: InitializePaymentDto) {
    const { shipmentId, email, name, redirectUrl } = dto;

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      throw new NotFoundException('SHIPMENT_NOT_FOUND');
    }

    const rawTotal = shipment.totalPrice;
    if (!rawTotal || Number(rawTotal) <= 0) {
      throw new BadRequestException('SHIPMENT_AMOUNT_INVALID');
    }

    const txRef = `AVR-${randomUUID()}`;
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'http://localhost:3000';
    const finalRedirectUrl = redirectUrl || `${frontendUrl}/payment/verify`;

    const payload = {
      tx_ref: txRef,
      amount: Number(rawTotal),
      currency: 'NGN',
      redirect_url: finalRedirectUrl,
      customer: {
        email: email || 'customer@aviorego.com.ng',
        name: name || 'Valued Customer',
      },
      customizations: {
        title: 'Pay AVIORÈ',
        description: `Payment for Shipment #${shipment.id.slice(-6).toUpperCase()}`,
      },
      meta: {
        shipmentId: shipment.id,
      },
    };

    try {
      const response = await axios.post(
        'https://api.flutterwave.com/v3/payments',
        payload,
        { headers: this.headers }, // Uses unified authorization headers
      );

      const paymentLink = response.data?.data?.link;
      if (!paymentLink) {
        throw new Error('PAYMENT_LINK_NOT_GENERATED');
      }

      this.logger.log(`✅ Flutterwave Hosted Link generated: ${paymentLink}`);

      await this.prisma.payment.create({
        data: {
          shipmentId: shipment.id,
          customerId: shipment.customerId,
          txRef: txRef,
          amount: Number(rawTotal),
          currency: 'NGN',
          gateway: 'FLUTTERWAVE',
          status: 'PENDING',
        },
      });

      return { link: paymentLink };
    } catch (error: any) {
      const flwErrorMessage = error.response?.data?.message || error.message;
      this.logger.error(`PAYMENT_INIT_ERROR: ${flwErrorMessage}`);
      throw new InternalServerErrorException(
        `PAYMENT_INITIALIZATION_FAILED: ${flwErrorMessage}`,
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

      if (isSuccessful && updatedPayment.shipmentId) {
        await this.activateAndDispatchShipment(updatedPayment.shipmentId);
      }

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
          .catch((err) => this.logger.error('[NOTIFICATION_ERROR]', err));
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

      this.notificationService
        .dispatch({
          type: NotificationType.WITHDRAWAL_UPDATE,
          userId: dto.riderId,
          title: 'Payout Processing',
          body: `Your withdrawal of ₦${dto.amount} to ${dto.bankName} (${dto.accountNumber}) has been initiated via Flutterwave.`,
          data: { withdrawalId: withdrawal.id },
        })
        .catch((err) => this.logger.error('[NOTIFICATION_ERROR]', err));

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

    if (!signature || signature !== secretHash) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const { event, data } = payload;

    if (event === 'transfer.completed') {
      const withdrawal = await this.prisma.withdrawal.findFirst({
        where: { flutterwaveReference: data.reference },
      });

      if (!withdrawal) {
        return { status: 'Ignored: Withdrawal not found' };
      }

      if (data.status === 'SUCCESS') {
        await this.prisma.$transaction(async (tx) => {
          await tx.withdrawal.update({
            where: { id: withdrawal.id },
            data: { status: 'SUCCESS' },
          });

          await tx.wallet.update({
            where: { id: withdrawal.walletId },
            data: {
              pendingBalance: { decrement: withdrawal.amount },
            },
          });
        });

        this.notificationService
          .dispatch({
            type: NotificationType.WITHDRAWAL_UPDATE,
            userId: withdrawal.riderId,
            title: 'Withdrawal Completed',
            body: `Your payout of ₦${withdrawal.amount} to ${withdrawal.bankName} has been completed successfully.`,
            data: { withdrawalId: withdrawal.id },
          })
          .catch((err) => this.logger.error('[NOTIFICATION_ERROR]', err));
      } else if (data.status === 'FAILED') {
        await this.prisma.$transaction(async (tx) => {
          await tx.withdrawal.update({
            where: { id: withdrawal.id },
            data: { status: 'FAILED' },
          });

          await tx.wallet.update({
            where: { id: withdrawal.walletId },
            data: {
              pendingBalance: { decrement: withdrawal.amount },
              availableBalance: { increment: withdrawal.amount },
            },
          });
        });

        this.notificationService
          .dispatch({
            type: NotificationType.WITHDRAWAL_UPDATE,
            userId: withdrawal.riderId,
            title: 'Withdrawal Failed',
            body: `Your withdrawal request of ₦${withdrawal.amount} failed and funds have been returned to your available balance.`,
            data: { withdrawalId: withdrawal.id },
          })
          .catch((err) => this.logger.error('[NOTIFICATION_ERROR]', err));
      }
    }

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

        if (payment.shipmentId) {
          await this.activateAndDispatchShipment(payment.shipmentId);
        }
      }
    }

    return { status: 'success' };
  }
}