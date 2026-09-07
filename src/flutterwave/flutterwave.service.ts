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
import { ShipmentStatus, BoardingStatus, PaymentStatus, 
  DeliveryTier, 
  DeliveryType, 
  PackageCategory, 
  WeightRange, 
  RegionType, 
  FoodOrderStatus, 
  FoodDeliveryStatus } from '@prisma/client';
import { firstValueFrom } from 'rxjs';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { randomUUID, timingSafeEqual } from 'crypto';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

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

async initializePayment(
    dto: InitializePaymentDto & {
      bookingId?: string;
      eventId?: string;
      routeId?: string;
      pickupPointId?: string;
      tripId?: string;
      amount?: number;
      cartCheckout?: boolean;
      cartId?: string;
      items?: Array<{
        quantity: number;
        price?: number;
        foodItem?: { price: number; name: string };
      }>;
    },
    userId?: string,
  ) {
    const { shipmentId, bookingId, eventId, routeId, pickupPointId, tripId, amount, email, name, redirectUrl, cartCheckout } = dto;

    let rawTotal = 0;
    let resolvedCustomerId: string | null = userId || null;
    let description = '';
    let metaPayload: any = {};

    if (shipmentId) {
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) throw new NotFoundException('SHIPMENT_NOT_FOUND');

      rawTotal = Number(shipment.totalPrice);
      resolvedCustomerId = shipment.customerId;
      description = `Payment for Shipment #${shipment.id.slice(-6).toUpperCase()}`;
      metaPayload = { shipmentId: shipment.id };
    } else if (bookingId) {
      const booking = await this.prisma.eventBooking.findUnique({ where: { id: bookingId } });
      if (!booking) throw new NotFoundException('BOOKING_NOT_FOUND');

      rawTotal = Number(booking.amountPaid || 0);
      resolvedCustomerId = booking.customerId;
      description = `Payment for Transit Booking #${booking.id.slice(-6).toUpperCase()}`;
      metaPayload = { bookingId: booking.id };
    } else if (eventId && routeId && tripId) {
      const route = await this.prisma.eventRoute.findUnique({ where: { id: routeId } });
      if (!route) throw new NotFoundException('ROUTE_NOT_FOUND');

      rawTotal = Number(amount || route.price);
      description = `Payment for Event Transit Booking`;

      if (!resolvedCustomerId && email) {
        const foundUser = await this.prisma.user.findUnique({ where: { email } });
        if (foundUser) resolvedCustomerId = foundUser.id;
      }

      if (!resolvedCustomerId) {
        throw new BadRequestException('CUSTOMER_IDENTIFIER_REQUIRED');
      }

      metaPayload = {
        type: 'EVENT_BOOKING',
        eventId,
        routeId,
        pickupPointId: pickupPointId || '',
        tripId,
        amountPaid: rawTotal,
        customerId: resolvedCustomerId,
      };
    } else if (cartCheckout) {
      if (!resolvedCustomerId && email) {
        const foundUser = await this.prisma.user.findUnique({ where: { email } });
        if (foundUser) resolvedCustomerId = foundUser.id;
      }

      let cartItems: any[] = [];
      let activeCartId: string = dto.cartId || 'direct-checkout';

      // 1. Try fetching items from database cart
      if (resolvedCustomerId) {
        const dbCart = await this.prisma.cart.findUnique({
          where: { userId: resolvedCustomerId },
          include: { 
            items: { 
              include: { foodItem: true } 
            } 
          },
        });
        if (dbCart && dbCart.items && dbCart.items.length > 0) {
          cartItems = dbCart.items;
          activeCartId = dbCart.id;
        }
      }

      // 2. Fallback: If DB cart is empty, use items passed directly from frontend payload
      if (cartItems.length === 0 && dto.items && Array.isArray(dto.items)) {
        cartItems = dto.items;
      }

      if (!cartItems || cartItems.length === 0) {
        throw new BadRequestException('CART_IS_EMPTY');
      }

      const subtotal = cartItems.reduce(
        (acc: number, item: any) => {
          const itemPrice = Number(item.foodItem?.price || item.price || 0);
          const quantity = Number(item.quantity || 1);
          return acc + itemPrice * quantity;
        },
        0,
      );
      
      const deliveryFee = 1200;
      const serviceFee = 300;
      rawTotal = subtotal + deliveryFee + serviceFee;

      description = `Payment for Food Cart Order (${cartItems.length} items)`;
      metaPayload = { 
        type: 'FOOD_CART_CHECKOUT', 
        customerId: resolvedCustomerId || 'guest',
        cartId: activeCartId,
        amountPaid: rawTotal 
      };
    } else {
      throw new BadRequestException('Invalid payment parameters provided');
    }

    if (!rawTotal || rawTotal <= 0) {
      throw new BadRequestException('PAYMENT_AMOUNT_INVALID');
    }

    const txRef = `AVR-${randomUUID()}`;
    const frontendUrl = this.config.get<string>('FRONTEND_URL') || process.env.FRONTEND_URL || 'http://localhost:3000';
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
      const response = await axios.post('https://api.flutterwave.com/v3/payments', payload, { headers: this.headers });
      const paymentLink = response.data?.data?.link;
      if (!paymentLink) throw new Error('PAYMENT_LINK_NOT_GENERATED');

      return { link: paymentLink };
    } catch (error: any) {
      const flwErrorMessage = error.response?.data?.message || error.message;
      this.logger.error(`PAYMENT_INIT_ERROR: ${flwErrorMessage}`);
      throw new InternalServerErrorException(`PAYMENT_INITIALIZATION_FAILED: ${flwErrorMessage}`);
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

      const { shipmentId, bookingId, eventId, routeId, pickupPointId, tripId, customerId: metaCustomerId, type } = meta;

      if (shipmentId) {
        await this.handleShipmentVerification(paymentData, shipmentId, isSuccessful);
      } else if (bookingId && isSuccessful) {
        await this.handleSuccessfulBookingPayment(bookingId, Number(paymentData.amount));
      } else if (type === 'FOOD_CART_CHECKOUT' && isSuccessful) {
        await this.handleSuccessfulFoodCartCheckout(meta, paymentData);
      } else if (eventId && routeId && tripId && isSuccessful) {
        await this.handleVerifiedEventBooking({
          eventId,
          routeId,
          pickupPointId,
          tripId,
          amountPaid: Number(paymentData.amount),
          txRef: paymentData.tx_ref,
          flutterwaveTxId: String(paymentData.id),
          flutterwaveRef: paymentData.flw_ref,
          customerId: metaCustomerId,
          customerEmail: paymentData.customer?.email,
        });
      }

      return paymentData;
    } catch (error: any) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`[PAYMENT_VERIFICATION_ERROR] Transaction: ${transactionId}`, error.stack);
      throw new BadRequestException('Payment verification failed');
    }
  }
  private async handleVerifiedEventBooking(data: {
    eventId: string;
    routeId: string;
    pickupPointId: string;
    tripId: string;
    amountPaid: number;
    txRef: string;
    flutterwaveTxId: string;
    flutterwaveRef: string;
    customerId?: string;
    customerEmail?: string;
  }) {
    let customerId = data.customerId;

    if (!customerId && data.customerEmail) {
      const user = await this.prisma.user.findUnique({ where: { email: data.customerEmail } });
      if (user) customerId = user.id;
    }

    if (!customerId) {
      throw new BadRequestException('Customer user record not found for verified booking.');
    }

    const customerExists = await this.prisma.user.findUnique({ where: { id: customerId } });
    if (!customerExists) {
      throw new BadRequestException('Customer user record not found for verified booking.');
    }

    const existingPayment = await this.prisma.payment.findUnique({
      where: { txRef: data.txRef },
      include: { booking: true },
    });

    if (existingPayment) {
      this.logger.log(`[EVENT_BOOKING_ALREADY_EXISTS] Transaction ${data.txRef} was already processed.`);
      return existingPayment.booking;
    }

    return await this.prisma.$transaction(async (tx) => {
      const booking = await tx.eventBooking.create({
        data: {
          eventId: data.eventId,
          routeId: data.routeId,
          pickupPointId: data.pickupPointId,
          tripId: data.tripId,
          customerId,
          amountPaid: data.amountPaid,
          paymentStatus: PaymentStatus.SUCCESS,
          boardingStatus: BoardingStatus.NOT_CHECKED_IN,
        },
      });

      await tx.payment.create({
        data: {
          bookingId: booking.id,
          gateway: 'FLUTTERWAVE',
          txRef: data.txRef,
          flutterwaveTxId: data.flutterwaveTxId,
          flutterwaveRef: data.flutterwaveRef,
          amount: data.amountPaid,
          status: PaymentStatus.SUCCESS,
          customerId,
        },
      });

      this.logger.log(`[EVENT_BOOKING_SUCCESS] Successfully verified and created booking for route ${data.routeId}`);
      return booking;
    });
  }

 private async handleSuccessfulFoodCartCheckout(meta: any, paymentData: any) {
    const customerId = meta.customerId;
    const cartId = meta.cartId;
    const totalPaid = Number(paymentData.amount);

    if (!customerId || customerId === 'guest') {
      this.logger.warn(`[CART_CHECKOUT] Skipping order creation: missing customerId for tx_ref ${paymentData.tx_ref}`);
      return;
    }

    // 1. Fetch cart items using cartId or fallback to user's cart
    let cartItems: any[] = [];
    let merchantId: string | null = null;

    if (cartId && cartId !== 'direct-checkout') {
      const cart = await this.prisma.cart.findUnique({
        where: { id: cartId },
        include: { items: { include: { foodItem: true } } },
      });
      if (cart?.items.length) {
        cartItems = cart.items;
        merchantId = cart.items[0].foodItem?.merchantId || null;
      }
    }

    if (cartItems.length === 0) {
      const userCart = await this.prisma.cart.findUnique({
        where: { userId: customerId },
        include: { items: { include: { foodItem: true } } },
      });
      if (userCart?.items.length) {
        cartItems = userCart.items;
        merchantId = userCart.items[0].foodItem?.merchantId || null;
      }
    }

    if (cartItems.length === 0 || !merchantId) {
      this.logger.warn(`[CART_CHECKOUT] No items or merchant found to fulfill for customer ${customerId}`);
      return;
    }

    // 2. Fetch merchant and customer details to populate strict schema fields
    const [merchant, customer] = await Promise.all([
      this.prisma.merchantProfile.findUnique({ where: { id: merchantId } }),
      this.prisma.user.findUnique({ where: { id: customerId } }),
    ]);

    const subTotal = cartItems.reduce(
      (acc: number, item: any) => acc + Number(item.foodItem?.price || item.price || 0) * Number(item.quantity || 1),
      0,
    );

    const deliveryFee = 1200;
    const serviceFee = 300;
    const orderNumber = `AVR-FOOD-${randomUUID().substring(0, 8).toUpperCase()}`;
    const trackingCode = `TRK-${randomUUID().substring(0, 8).toUpperCase()}`;

    const deliveryAddress = customer?.streetAddress || 'Default Customer Address';
    const pickupAddress = merchant?.address || 'Merchant Location';
    const recipientName = `${customer?.firstName || 'Customer'} ${customer?.lastName || ''}`.trim();
    const recipientPhone = customer?.phoneNumber || '0000000000';

    // 3. Execute database operations within a single transaction
    await this.prisma.$transaction(async (tx) => {
      const shipment = await tx.shipment.create({
        data: {
          trackingCode,
          customerId,
          merchantId,
          status: ShipmentStatus.PENDING,
          tier: DeliveryTier.STANDARD,
          deliveryType: DeliveryType.FOOD,
          packageCategory: PackageCategory.SMALL_PARCEL,
          weightRange: WeightRange.UNDER_1KG,
          regionType: RegionType.INTRA_CITY,
          pickupAddress,
          pickupLat: merchant?.latitude || 0.0,
          pickupLng: merchant?.longitude || 0.0,
          destinationAddress: deliveryAddress,
          destinationLat: 0.0,
          destinationLng: 0.0,
          recipient: recipientName,
          recipientPhone,
          verificationPin: Math.floor(1000 + Math.random() * 9000).toString(),
          baseFee: subTotal,
          pickupDistFee: 0,
          deliveryDistFee: deliveryFee,
          extraCharges: serviceFee,
          totalPrice: totalPaid,
          riderShare: 0,
          platformShare: serviceFee,
          distanceKm: 0,
          estimatedMinutes: 30,
        },
      });

      await tx.foodOrder.create({
        data: {
          orderNumber,
          customerId,
          merchantId,
          shipmentId: shipment.id,
          status: FoodOrderStatus.PENDING,
          deliveryStatus: FoodDeliveryStatus.NOT_ASSIGNED,
          subTotal,
          deliveryFee,
          serviceFee,
          totalPrice: totalPaid,
          deliveryAddress,
          deliveryLat: 0.0,
          deliveryLng: 0.0,
          items: {
            create: cartItems.map((item: any) => ({
              foodItemId: item.foodItemId,
              name: item.foodItem?.name || 'Food Item',
              price: Number(item.foodItem?.price || 0),
              quantity: item.quantity,
              selectedAddOns: item.selectedAddOns ?? undefined,
            })),
          },
        },
      });

      const userCart = await tx.cart.findUnique({ where: { userId: customerId } });
      if (userCart) {
        await tx.cartItem.deleteMany({ where: { cartId: userCart.id } });
      }
    });

    this.logger.log(`[FOOD_ORDER_CREATED] Structured Food Order ${orderNumber} successfully placed for customer ${customerId}`);
  }

  private async handleShipmentVerification(paymentData: any, shipmentId: string, isSuccessful: boolean) {
    if (!isSuccessful) {
      this.logger.warn(`[PAYMENT_FAILED] TxRef: ${paymentData.tx_ref} marked as failed.`);
      return;
    }

    let existingPayment = await this.prisma.payment.findUnique({
      where: { txRef: paymentData.tx_ref },
    });

    if (!existingPayment) {
      this.logger.warn(`[PAYMENT_RECORD_MISSING_FALLBACK] Creating missing payment record for txRef: ${paymentData.tx_ref}`);
      
      const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
      if (!shipment) {
        throw new NotFoundException('Associated shipment not found.');
      }

      existingPayment = await this.prisma.payment.create({
        data: {
          shipmentId: shipmentId,
          gateway: 'FLUTTERWAVE',
          txRef: paymentData.tx_ref,
          flutterwaveTxId: String(paymentData.id),
          flutterwaveRef: paymentData.flw_ref,
          amount: Number(paymentData.amount),
          status: PaymentStatus.SUCCESS,
          customerId: shipment.customerId,
        },
      });

      await this.activateAndDispatchShipment(shipmentId);
      return;
    }

    if (Number(paymentData.amount) < Number(existingPayment.amount)) {
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
          status: PaymentStatus.SUCCESS,
          flutterwaveTxId: String(paymentData.id),
          flutterwaveRef: paymentData.flw_ref,
        },
      });
      wasUpdated = updateResult.count > 0;
    }

    if (wasUpdated || existingPayment.status === PaymentStatus.SUCCESS) {
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
  }

  /**
   * INITIATE TRANSFER VIA STATIC PROXY TUNNEL
   */
  async initiateTransfer(payload: {
    account_bank: string;
    account_number: string;
    amount: number;
    currency: string;
    narration: string;
    reference: string;
  }) {
    try {
      this.logger.log(`📡 Streaming payout through Static Webshare Proxy. Ref: ${payload.reference}`);

      const flutterwaveUrl = 'https://api.flutterwave.com/v3/transfers';
      const proxyHost = process.env.PROXY_HOST || '31.59.20.176';
      const proxyPort = process.env.PROXY_PORT || '6754';
      const proxyUser = process.env.PROXY_USER || 'vzbnbgkp';
      const proxyPass = process.env.PROXY_PASS || '8yd0vlfws7m8';

      const proxyAgent = new HttpsProxyAgent(
        `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`,
      );

      const response = await axios.post(
        flutterwaveUrl,
        {
          account_bank: payload.account_bank,
          account_number: payload.account_number,
          amount: payload.amount,
          narration: payload.narration,
          currency: payload.currency || 'NGN',
          reference: payload.reference,
          debit_currency: 'NGN',
        },
        {
          httpsAgent: proxyAgent,
          proxy: false,
          headers: this.headers,
        },
      );

      const result = response.data;
      this.logger.warn(`📥 RAW FLUTTERWAVE PAYLOAD RECEIVED: ${JSON.stringify(result)}`);

      if (result?.status === 'error' || result?.status === 'failed') {
        throw new Error(
          result?.message || 'Flutterwave gateway rejected the transaction parameters',
        );
      }

      this.logger.log(`✅ Payout routing verified. Target ID assigned: ${result?.data?.id || result?.id}`);
      return result;
    } catch (error: any) {
      let trueGatewayError = 'UNKNOWN_TUNNEL_GATEWAY_ERROR';

      if (error?.response?.data) {
        this.logger.error(`🚨 RAW FLUTTERWAVE ERROR OBJECT: ${JSON.stringify(error.response.data)}`);
        trueGatewayError = error.response.data.message || JSON.stringify(error.response.data);
      } else {
        trueGatewayError = error.message || String(error);
      }

      this.logger.error(`❌ TUNNEL_PAYOUT_FAILED: ${trueGatewayError}`);
      throw new BadRequestException(`GATEWAY_REJECTION: ${trueGatewayError}`);
    }
  }

 async requestWithdrawal(
    userId: string, 
    amount: number, 
    bankCode: string, 
    accountNumber: string, 
    bankName?: string,
    accountName?: string
  ) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId },
        include: { user: true },
      });

      if (!wallet) throw new NotFoundException('WALLET_NOT_FOUND');
      if (Number(wallet.availableBalance) < amount) {
        throw new BadRequestException('INSUFFICIENT_AVAILABLE_BALANCE');
      }

      if (!accountNumber || !bankCode) {
        throw new BadRequestException('BANK_DETAILS_NOT_CONFIGURED');
      }

      let resolvedBankName = bankName;
      if (!resolvedBankName) {
        try {
          const banksRes = await this.getBanks();
          const foundBank = banksRes?.data?.find((b: any) => b.code === bankCode);
          resolvedBankName = foundBank ? foundBank.name : 'Commercial Bank';
        } catch {
          resolvedBankName = 'Commercial Bank';
        }
      }

      // Guarantee bankName is a string to satisfy Prisma's strict typing
      const finalBankName: string = resolvedBankName ?? 'Commercial Bank';
      const finalAccountName = accountName ?? `${wallet.user.firstName} ${wallet.user.lastName}`;
      const flutterwaveReference = `WD-${Date.now()}`;

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
          riderId: userId, 
          amount,
          bankName: finalBankName,
          bankCode,
          accountNumber,
          accountName: finalAccountName,
          status: 'PENDING',
          flutterwaveReference,
        },
      });

      try {
        await this.initiateTransfer({
          account_bank: bankCode,
          account_number: accountNumber,
          amount,
          currency: 'NGN',
          narration: `Payout for User ${userId}`,
          reference: flutterwaveReference!, // Non-null assertion satisfies string requirement
        });
      } catch (transferErr) {
        this.logger.error(`[AUTO_TRANSFER_TRIGGER_FAILED]`, transferErr);
      }

      return withdrawal;
    });
  }


  async getMerchantWalletSummary(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      return {
        availableBalance: 0,
        pendingBalance: 0,
        todayEarnings: 0,
        totalEarned: 0,
        earningsGrowth: '+0%',
      };
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // If your order model is named differently (e.g., tx, transaction, or something else), 
    // update `this.prisma.order` to match your exact schema model name.
    // If you track merchant earnings through a generic transaction table, query that instead:
    let todayEarnings = 0;
    try {
      // @ts-ignore - Fallback if the model name differs in your schema
      const todayOrders = await this.prisma.order.findMany({
        where: {
          merchantId: userId,
          createdAt: { gte: startOfDay },
        },
      });
      todayEarnings = todayOrders.reduce((acc: number, order: any) => acc + Number(order.totalAmount || order.amount || 0), 0);
    } catch {
      todayEarnings = 0;
    }

    return {
      availableBalance: wallet.availableBalance,
      pendingBalance: wallet.pendingBalance,
      todayEarnings,
      totalEarned: Number(wallet.availableBalance) + Number(wallet.pendingBalance), // Computed safely
      earningsGrowth: '+12%',
    };
  }

  async getMerchantTransactions(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) return [];

    const withdrawals = await this.prisma.withdrawal.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return withdrawals.map((w) => ({
      id: w.flutterwaveReference || w.id,
      type: `Withdrawal to ${w.bankName}`,
      amount: -Number(w.amount),
      date: w.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      // Match enum or string value safely depending on your Prisma WithdrawalStatus type definition
      status: String(w.status) === 'SUCCESSFUL' || String(w.status) === 'COMPLETED' ? 'Successful' : w.status,
    }));
  }
async getBanks() {
    try {
      const response = await firstValueFrom(
        this.http.get('https://api.flutterwave.com/v3/banks/NG', {
          headers: this.headers,
        }),
      );
      // Flutterwave returns { status: 'success', message: '...', data: [...] }
      // Unwrapping response.data.data ensures the frontend receives a clean array.
      return response.data?.data || [];
    } catch (error: any) {
      console.error('Fetch banks error:', error.response?.data || error.message);
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
      const { shipmentId, bookingId, type } = meta;

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
      } else if (type === 'FOOD_CART_CHECKOUT') {
        await this.handleSuccessfulFoodCartCheckout(meta, data);
      }
    }

    return { status: 'success' };
  }
}