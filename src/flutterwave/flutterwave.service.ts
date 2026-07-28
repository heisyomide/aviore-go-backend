import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../providers/database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/dto/send-notification.dto';
import { DispatchService } from '../dispatch/dispatch.service';
import { ShipmentStatus, PaymentStatus } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { TransferDto } from './dto/transfer.dto';

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

  private get headers() {
    return {
      Authorization: `Bearer ${this.config.get<string>('FLW_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Helper: Activates shipment and dispatches to riders AFTER verified payment
   */
  private async activateAndDispatchShipment(shipmentId: string) {
    if (!shipmentId) return;

    // Fetch shipment from DB
    const currentShipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!currentShipment) {
      this.logger.warn(`Shipment ${shipmentId} not found for payment activation.`);
      return;
    }

    // 🟢 ONLY activate if current status is AWAITING_PAYMENT.
    // Prevents duplicate dispatching if the shipment is already PENDING, ACCEPTED, etc.
    if (currentShipment.status !== ShipmentStatus.AWAITING_PAYMENT) {
      this.logger.log(
        `Shipment ${shipmentId} status is already '${currentShipment.status}'. Skipping dispatch activation.`,
      );
      return;
    }

    // 1. Transition Shipment Status from AWAITING_PAYMENT -> PENDING
    const updatedShipment = await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: ShipmentStatus.PENDING,
        timelineEvents: {
          create: {
            status: ShipmentStatus.PENDING,
            description: 'Payment verified successfully. Searching for available riders.',
            changedBy: 'SYSTEM',
          },
        },
      },
    });

    // 2. Dispatch to riders NOW because payment is confirmed
    try {
      await this.dispatchService.dispatchShipment(updatedShipment);
      this.logger.log(`Shipment ${shipmentId} successfully activated & dispatched.`);
    } catch (err) {
      this.logger.error(`[DISPATCH_ERROR_AFTER_PAYMENT] Shipment: ${shipmentId}`, err);
    }
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
        logo: 'https://aviorego.com.ng/images/logo.png',
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

      const flwData = response.data;

      // Safely extract the full payment link from Flutterwave
      const paymentLink = flwData?.data?.link;

      if (!paymentLink) {
        throw new BadRequestException('Flutterwave failed to return a valid payment link.');
      }

      // 1. Record payment in DB with PENDING status
      await this.prisma.payment.create({
        data: {
          shipmentId: dto.shipmentId,
          customerId: dto.customerId,
          txRef,
          amount: dto.amount,
          currency: 'NGN',
          gateway: 'FLUTTERWAVE',
          status: PaymentStatus.PENDING,
        },
      });

      // 2. Keep shipment in AWAITING_PAYMENT until webhook or verification confirms payment
      if (dto.shipmentId) {
        await this.prisma.shipment.update({
          where: { id: dto.shipmentId },
          data: { status: ShipmentStatus.AWAITING_PAYMENT },
        }).catch(() => {});
      }

      // Return clean response to frontend
      return {
        status: 'success',
        message: 'Payment link generated',
        data: {
          link: paymentLink,
          txRef,
        },
      };
    } catch (error: any) {
      this.logger.error('Flutterwave Initialization Error:', error?.response?.data || error);
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

      // Update Payment Record
      const updatedPayment = await this.prisma.payment.update({
        where: {
          txRef: paymentData.tx_ref,
        },
        data: {
          status: isSuccessful ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
          flutterwaveTxId: String(paymentData.id),
          flutterwaveRef: paymentData.flw_ref,
        },
      });

      // 🚀 Activate & Dispatch Shipment if payment succeeded
      if (isSuccessful && updatedPayment.shipmentId) {
        await this.activateAndDispatchShipment(updatedPayment.shipmentId);
      }

      // 🔔 Send Payment Receipt Notification
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

      // 🔔 Dispatch Notification
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

    // 3. Handle Charge/Payment Events
    if (event === 'charge.completed' && data.status === 'successful') {
      const payment = await this.prisma.payment.findUnique({
        where: { txRef: data.tx_ref },
      });

      if (payment && payment.status === PaymentStatus.PENDING) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.SUCCESS,
            flutterwaveTxId: String(data.id),
            flutterwaveRef: data.flw_ref,
          },
        });

        // 🚀 Activate & Dispatch Shipment safely via Webhook
        if (payment.shipmentId) {
          await this.activateAndDispatchShipment(payment.shipmentId);
        }
      }
    }

    return { status: 'success' };
  }
}