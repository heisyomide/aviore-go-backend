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
import { ShipmentStatus, BoardingStatus, PaymentStatus } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { randomUUID, timingSafeEqual } from 'crypto';
import axios from 'axios';

const QRCode = require('qrcode');

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

  private get headers() {
    return {
      Authorization: `Bearer ${this.getSecretKey()}`,
      'Content-Type': 'application/json',
    };
  }

  private async activateAndDispatchShipment(shipmentId: string) {
    if (!shipmentId) return;

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

  private async handleSuccessfulBookingPayment(bookingId: string, amountPaid: number) {
    if (!bookingId) return;

    const ticketCode = `AVR-TKT-${randomUUID().substring(0, 8).toUpperCase()}`;
    const qrCodeDataUrl = await QRCode.toDataURL(ticketCode);

    const booking = await this.prisma.eventBooking.update({
      where: { id: bookingId },
      data: {
        paymentStatus: PaymentStatus.SUCCESS,
        qrToken: ticketCode,
        boardingStatus: BoardingStatus.NOT_CHECKED_IN,
      },
      include: {
        event: true,
      },
    });

    this.logger.log(`🎟️ Ticket & QR Code generated for Booking ${bookingId} (${ticketCode})`);

    if (booking?.customerId) {
      this.notificationService
        .dispatch({
          type: NotificationType.PAYMENT_RECEIPT,
          userId: booking.customerId,
          title: 'Booking Confirmed!',
          body: `Your payment of ₦${amountPaid} was confirmed. Your ticket code is ${ticketCode}.`,
          data: {
            bookingId: booking.id,
            ticketCode,
          },
        })
        .catch((err) => this.logger.error('[NOTIFICATION_ERROR]', err));
    }
  }

  async initializePayment(dto: InitializePaymentDto & { bookingId?: string }) {
    const { shipmentId, bookingId, email, name, redirectUrl } = dto;

    let rawTotal = 0;
    let customerId: string | null = null;
    let description = '';
    let metaPayload: any = {};

    if (shipmentId) {
      const shipment = await this.prisma.shipment.findUnique({
        where: { id: shipmentId },
      });
      if (!shipment) throw new NotFoundException('SHIPMENT_NOT_FOUND');
      
      rawTotal = Number(shipment.totalPrice);
      customerId = shipment.customerId;
      description = `Payment for Shipment #${shipment.id.slice(-6).toUpperCase()}`;
      metaPayload = { shipmentId: shipment.id };
    } else if (bookingId) {
      const booking = await this.prisma.eventBooking.findUnique({
        where: { id: bookingId },
        include: { event: true },
      });
      if (!booking) throw new NotFoundException('BOOKING_NOT_FOUND');

      rawTotal = Number(booking.amountPaid || 0);
      customerId = booking.customerId;
      description = `Payment for Transit Booking #${booking.id.slice(-6).toUpperCase()}`;
      metaPayload = { bookingId: booking.id };
    } else {
      throw new BadRequestException('Either shipmentId or bookingId must be provided');
    }

    if (!rawTotal || rawTotal <= 0) {
      throw new BadRequestException('PAYMENT_AMOUNT_INVALID');
    }

    const txRef = `AVR-${randomUUID()}`;
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'http://localhost:3000';
    const finalRedirectUrl = redirectUrl || `${frontendUrl}/payment/verify`;

    const payload = {
      tx_ref: txRef,
      amount: rawTotal,
      currency: 'NGN',
      redirect_url: finalRedirectUrl,
      customer: {
        email: email || 'customer@aviorego.com.ng',
        name: name || 'Valued Customer',
      },
      customizations: {
        title: 'Pay AVIORÈ',
        description,
      },
      meta: metaPayload,
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

      if (shipmentId && customerId) {
        await this.prisma.payment.create({
          data: {
            shipmentId: shipmentId,
            customerId: customerId,
            txRef: txRef,
            amount: rawTotal,
            currency: 'NGN',
            gateway: 'FLUTTERWAVE',
            status: PaymentStatus.PENDING,
          },
        });
      }

      return { link: paymentLink };
    } catch (error: any) {
      const flwErrorMessage = error.response?.data?.message || error.message;
      this.logger.error(`PAYMENT_INIT_ERROR: ${flwErrorMessage}`);
      throw new InternalServerErrorException(
        `PAYMENT_INITIALIZATION_FAILED: ${flwErrorMessage}`,
      );
    }
  }

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
      const meta = paymentData.meta || {};
      const shipmentId = meta.shipmentId;
      const bookingId = meta.bookingId;

      if (shipmentId) {
        const existingPayment = await this.prisma.payment.findUnique({
          where: { txRef: paymentData.tx_ref },
        });

        if (!existingPayment) {
          throw new NotFoundException('Transaction record not found.');
        }

        if (isSuccessful && Number(paymentData.amount) < Number(existingPayment.amount)) {
          this.logger.error(
            `[PAYMENT_FRAUD_ATTEMPT] TxRef: ${paymentData.tx_ref}. Expected: ${existingPayment.amount}, Paid: ${paymentData.amount}`,
          );
          throw new BadRequestException('Paid amount does not match expected amount.');
        }

        let wasUpdated = false;
        if (existingPayment.status === PaymentStatus.PENDING) {
          const updateResult = await this.prisma.payment.updateMany({
            where: {
              txRef: paymentData.tx_ref,
              status: PaymentStatus.PENDING,
            },
            data: {
              status: isSuccessful ? PaymentStatus.SUCCESS : PaymentStatus.FAILED,
              flutterwaveTxId: String(paymentData.id),
              flutterwaveRef: paymentData.flw_ref,
            },
          });
          wasUpdated = updateResult.count > 0;
        }

        if (isSuccessful && wasUpdated) {
          await this.activateAndDispatchShipment(shipmentId);

          if (existingPayment.customerId) {
            this.notificationService
              .dispatch({
                type: NotificationType.PAYMENT_RECEIPT,
                userId: existingPayment.customerId,
                title: 'Payment Successful',
                body: `Your payment of ₦${paymentData.amount} was confirmed successfully.`,
                data: {
                  paymentId: existingPayment.id,
                  shipmentId: shipmentId,
                },
              })
              .catch((err) => this.logger.error('[NOTIFICATION_ERROR]', err));
          }
        }
      } else if (bookingId && isSuccessful) {
        await this.handleSuccessfulBookingPayment(bookingId, Number(paymentData.amount));
      }

      return paymentData;
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      throw new BadRequestException('Payment verification failed');
    }
  }

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

      const riderProfile = await tx.riderProfile.findUnique({
        where: { userId },
      });

      if (!riderProfile?.bankName || !riderProfile?.accountNumber || !riderProfile?.bankCode) {
        throw new BadRequestException('BANK_DETAILS_NOT_CONFIGURED');
      }

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
      console.error('Flutterwave Account Resolve Error:', error.response?.data || error.message);
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        'Invalid bank account or bank code.';
      throw new BadRequestException(errorMessage);
    }
  }

  async handleWebhook(signature: string, payload: any) {
    const secretHash = this.config.get<string>('FLW_SECRET_HASH') || '';

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

    if (event === 'charge.completed' && data.status === 'successful') {
      const meta = data.meta || {};
      const shipmentId = meta.shipmentId;
      const bookingId = meta.bookingId;

      if (shipmentId) {
        const payment = await this.prisma.payment.findUnique({
          where: { txRef: data.tx_ref },
        });

        if (payment && payment.status === PaymentStatus.PENDING) {
          if (Number(data.amount) < Number(payment.amount)) {
            this.logger.error(`[WEBHOOK_FRAUD] Paid amount less than expected for txRef: ${data.tx_ref}`);
            return { status: 'Ignored: Invalid payment amount' };
          }

          const updateResult = await this.prisma.payment.updateMany({
            where: { id: payment.id, status: PaymentStatus.PENDING },
            data: {
              status: PaymentStatus.SUCCESS,
              flutterwaveTxId: String(data.id),
              flutterwaveRef: data.flw_ref,
            },
          });

          if (updateResult.count > 0) {
            await this.activateAndDispatchShipment(shipmentId);
          }
        }
      } else if (bookingId) {
        await this.handleSuccessfulBookingPayment(bookingId, Number(data.amount));
      }
    }

    return { status: 'success' };
  }
}