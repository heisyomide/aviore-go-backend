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
import { randomUUID, timingSafeEqual } from 'crypto';
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
   * Helper: Retrieve and sanitize Flutterwave Secret Key
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

    // Atomically transition status from AWAITING_PAYMENT -> PENDING
    const updatedCount = await this.prisma.shipment.updateMany({
      where: {
        id: shipmentId,
        status: ShipmentStatus.AWAITING_PAYMENT,
      },
      data: {
        status: ShipmentStatus.PENDING,
      },
    });

    if (updatedCount.count === 0) {
      this.logger.warn(
        `[SKIP_DISPATCH] Shipment ${shipmentId} already processed or not in AWAITING_PAYMENT state.`,
      );
      return;
    }

    const updatedShipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!updatedShipment) return;

    await this.prisma.statusTimeline.create({
      data: {
        shipmentId: updatedShipment.id,
        status: ShipmentStatus.PENDING,
        description:
          'Payment verified successfully. Shipment active and dispatched to nearby riders.',
        changedBy: 'SYSTEM',
      },
    });

    try {
      if (this.dispatchService) {
        await this.dispatchService.dispatchShipment(updatedShipment);
        this.logger.log(`🚀 Shipment ${shipmentId} successfully dispatched to riders!`);
      }
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
        { headers: this.headers },
      );

      const paymentLink = response.data?.data?.link;
      if (!paymentLink) {
        throw new Error('PAYMENT_LINK_NOT_GENERATED');
      }

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

      const existingPayment = await this.prisma.payment.findUnique({
        where: { txRef: paymentData.tx_ref },
      });

      if (!existingPayment) {
        throw new NotFoundException('Transaction record not found.');
      }

      // Verify paid amount matches record amount
      if (isSuccessful && Number(paymentData.amount) < Number(existingPayment.amount)) {
        this.logger.error(
          `[PAYMENT_FRAUD_ATTEMPT] TxRef: ${paymentData.tx_ref}. Expected: ${existingPayment.amount}, Paid: ${paymentData.amount}`,
        );
        throw new BadRequestException('Paid amount does not match expected amount.');
      }

      // Idempotent Atomic Update: Only process if status is PENDING
      let wasUpdated = false;
      if (existingPayment.status === 'PENDING') {
        const updateResult = await this.prisma.payment.updateMany({
          where: {
            txRef: paymentData.tx_ref,
            status: 'PENDING',
          },
          data: {
            status: isSuccessful ? 'SUCCESS' : 'FAILED',
            flutterwaveTxId: String(paymentData.id),
            flutterwaveRef: paymentData.flw_ref,
          },
        });

        wasUpdated = updateResult.count > 0;
      }

      if (isSuccessful && wasUpdated && existingPayment.shipmentId) {
        await this.activateAndDispatchShipment(existingPayment.shipmentId);

        if (existingPayment.customerId) {
          this.notificationService
            .dispatch({
              type: NotificationType.PAYMENT_RECEIPT,
              userId: existingPayment.customerId,
              title: 'Payment Successful',
              body: `Your payment of ₦${paymentData.amount} was confirmed successfully.`,
              data: {
                paymentId: existingPayment.id,
                shipmentId: existingPayment.shipmentId,
              },
            })
            .catch((err) => this.logger.error('[NOTIFICATION_ERROR]', err));
        }
      }

      return paymentData;
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Payment verification failed');
    }
  }

  // flutterwave.service.ts
async initiateTransfer(payload: {
  account_bank: string;
  account_number: string;
  amount: number;
  currency: string;
  narration: string;
  reference: string;
}) {
  try {
    const response = await firstValueFrom(
      this.http.post(
        'https://api.flutterwave.com/v3/transfers',
        payload,
        { headers: this.headers },
      ),
    );
    return response.data;
  } catch (error: any) {
    throw new BadRequestException(
      error.response?.data?.message || 'Flutterwave transfer initiation failed',
    );
  }
}

  /**
   * Initiate Bank Transfer / Payout (With Strict Balance Locking)
   */
async requestWithdrawal(userId: string, amount: number) {
  return this.prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      include: { user: true },
    });

    if (!wallet) throw new NotFoundException('WALLET_NOT_FOUND');
    if (Number(wallet.availableBalance) < amount) {
      throw new BadRequestException('INSUFFICIENT_AVAILABLE_BALANCE');
    }

    // Get Rider's bank details from RiderProfile
    const riderProfile = await tx.riderProfile.findUnique({
      where: { userId },
    });

    if (!riderProfile?.bankName || !riderProfile?.accountNumber || !riderProfile?.bankCode) {
      throw new BadRequestException('BANK_DETAILS_NOT_CONFIGURED');
    }

    // Lock funds: Shift available balance to pending balance
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        availableBalance: { decrement: amount },
        pendingBalance: { increment: amount },
      },
    });

    // Create withdrawal record in PENDING state
    const withdrawal = await tx.withdrawal.create({
      data: {
        walletId: wallet.id,
        riderId: riderProfile.id,
        amount,
        bankName: riderProfile.bankName,
        bankCode: riderProfile.bankCode,
        accountNumber: riderProfile.accountNumber,
        accountName: riderProfile.accountName ?? `${wallet.user.firstName} ${wallet.user.lastName}`,
        status: 'PENDING',
        flutterwaveReference: `WD-${Date.now()}`,
      },
    });

    return withdrawal;
  });
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
    const secretHash = this.config.get<string>('FLW_SECRET_HASH') || '';

    // Timing-safe verification of signature
    if (!signature || !secretHash) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const signatureBuffer = Buffer.from(signature);
    const secretBuffer = Buffer.from(secretHash);

    if (
      signatureBuffer.length !== secretBuffer.length ||
      !timingSafeEqual(signatureBuffer, secretBuffer)
    ) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const { event, data } = payload;

    // Handle Transfer Events
    if (event === 'transfer.completed') {
      const withdrawal = await this.prisma.withdrawal.findFirst({
        where: { flutterwaveReference: data.reference },
      });

      if (!withdrawal || withdrawal.status !== 'PENDING') {
        return { status: 'Ignored: Withdrawal not found or already finalized' };
      }

      if (data.status === 'SUCCESS') {
        await this.prisma.$transaction([
          this.prisma.withdrawal.update({
            where: { id: withdrawal.id },
            data: { status: 'SUCCESS' },
          }),
          this.prisma.wallet.update({
            where: { id: withdrawal.walletId },
            data: { pendingBalance: { decrement: withdrawal.amount } },
          }),
        ]);

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
        await this.prisma.$transaction([
          this.prisma.withdrawal.update({
            where: { id: withdrawal.id },
            data: { status: 'FAILED' },
          }),
          this.prisma.wallet.update({
            where: { id: withdrawal.walletId },
            data: {
              pendingBalance: { decrement: withdrawal.amount },
              availableBalance: { increment: withdrawal.amount },
            },
          }),
        ]);

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

    // Handle Payment Charges
    if (event === 'charge.completed' && data.status === 'successful') {
      const payment = await this.prisma.payment.findUnique({
        where: { txRef: data.tx_ref },
      });

      if (payment && payment.status === 'PENDING') {
        // Validate amount against record
        if (Number(data.amount) < Number(payment.amount)) {
          this.logger.error(`[WEBHOOK_FRAUD] Paid amount less than expected for txRef: ${data.tx_ref}`);
          return { status: 'Ignored: Invalid payment amount' };
        }

        const updateResult = await this.prisma.payment.updateMany({
          where: { id: payment.id, status: 'PENDING' },
          data: {
            status: 'SUCCESS',
            flutterwaveTxId: String(data.id),
            flutterwaveRef: data.flw_ref,
          },
        });

        if (updateResult.count > 0 && payment.shipmentId) {
          await this.activateAndDispatchShipment(payment.shipmentId);
        }
      }
    }

    return { status: 'success' };
  }
}