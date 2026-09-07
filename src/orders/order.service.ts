import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { CreateFoodOrderDto } from './dto/create-food-order.dto';
import { Prisma, ShipmentStatus, PaymentStatus, FoodOrderStatus } from '@prisma/client';

@Injectable()
export class FoodOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  private async generateOrderTrackingCode(): Promise<string> {
    return `ORD-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  }

  /**
   * Create a new food order and calculate dynamic delivery pricing
   */
  async createFoodOrder(customerId: string, dto: CreateFoodOrderDto) {
    if (!customerId) {
      throw new BadRequestException('Customer ID is required.');
    }

    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { id: dto.merchantId },
    });

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found.');
    }

    let subTotal = 0;
    const orderItemsData: {
      foodItemId: string;
      name: string;
      price: number;
      quantity: number;
    }[] = [];

    for (const itemDto of dto.items) {
      // Accommodate either menu/food item ID from DTO variation
      const itemId = (itemDto as any).foodItemId || (itemDto as any).menuItemId;

      const foodItem = await this.prisma.foodItem.findUnique({
        where: { id: itemId },
      });

      if (!foodItem || !foodItem.isAvailable) {
        throw new BadRequestException(`Food item with ID ${itemId} is not available.`);
      }

      const itemTotal = Number(foodItem.price) * itemDto.quantity;
      subTotal += itemTotal;

      orderItemsData.push({
        foodItemId: foodItem.id,
        name: foodItem.name,
        price: Number(foodItem.price),
        quantity: itemDto.quantity,
      });
    }

    const pricingResult = this.pricingService.calculateFood({
      pickupLat: Number(merchant.latitude),
      pickupLng: Number(merchant.longitude),
      destinationLat: dto.destinationLat,
      destinationLng: dto.destinationLng,
      foodSubtotal: subTotal,
    });

    const orderNumber = await this.generateOrderTrackingCode();

    const foodOrder = await this.prisma.foodOrder.create({
      data: {
        orderNumber,
        customerId,
        merchantId: dto.merchantId,
        status: FoodOrderStatus.PENDING,
        subTotal: new Prisma.Decimal(subTotal),
        deliveryFee: new Prisma.Decimal(pricingResult.deliveryFee),
        serviceFee: new Prisma.Decimal(0),
        totalPrice: new Prisma.Decimal(pricingResult.totalPayable),
        deliveryAddress: dto.deliveryAddress,
        deliveryInstructions: dto.deliveryNote || '',
        deliveryLat: dto.destinationLat,
        deliveryLng: dto.destinationLng,
        items: {
          create: orderItemsData,
        },
      },
      include: {
        items: { include: { foodItem: true } },
        merchant: true,
      },
    });

    return {
      success: true,
      order: foodOrder,
      pricingBreakdown: pricingResult,
    };
  }

  /**
   * Triggered upon successful payment confirmation to create the logistics shipment
   */
  async handleSuccessfulPayment(orderId: string, transactionReference: string) {
    const order = await this.prisma.foodOrder.findUnique({
      where: { id: orderId },
      include: { merchant: true, customer: true },
    });

    if (!order) {
      throw new NotFoundException('Food order not found.');
    }

    const updatedOrder = await this.prisma.foodOrder.update({
      where: { id: orderId },
      data: {
        status: FoodOrderStatus.ACCEPTED,
      },
    });

    const pricingResult = this.pricingService.calculateFood({
      pickupLat: Number(order.merchant.latitude ?? 0),
      pickupLng: Number(order.merchant.longitude ?? 0),
      destinationLat: Number(order.deliveryLat),
      destinationLng: Number(order.deliveryLng),
      foodSubtotal: Number(order.subTotal),
    });

    const trackingCode = `SHP-FND-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const verificationPin = Math.floor(1000 + Math.random() * 9000).toString();

    const shipment = await this.prisma.shipment.create({
      data: {
        trackingCode,
        status: ShipmentStatus.PENDING,
        paymentStatus: PaymentStatus.SUCCESS,
        deliveryType: 'FOOD_DELIVERY' as any,
        packageCategory: 'FOOD' as any,
        weightRange: 'LIGHT' as any,
        regionType: 'INTER_STATE' as any,

        pickupAddress: order.merchant.address ?? '',
        pickupLat: Number(order.merchant.latitude ?? 0),
        pickupLng: Number(order.merchant.longitude ?? 0),
        senderName: order.merchant.businessName,
        senderPhone: order.merchant.phone,

        destinationAddress: order.deliveryAddress,
        destinationLat: order.deliveryLat,
        destinationLng: order.deliveryLng,
        recipient: order.customer?.firstName || 'Customer',
        recipientPhone: order.customer?.phoneNumber || '',

        verificationPin,
        distanceKm: pricingResult.distanceKm,
        estimatedMinutes: pricingResult.estimatedMinutes,

        baseFee: new Prisma.Decimal(pricingResult.breakdown.baseFee),
        pickupDistFee: new Prisma.Decimal(0),
        deliveryDistFee: new Prisma.Decimal(pricingResult.breakdown.deliveryDistanceFee),
        extraCharges: new Prisma.Decimal(0),
        totalPrice: new Prisma.Decimal(pricingResult.deliveryFee),
        riderShare: new Prisma.Decimal(pricingResult.splits.riderShare),
        platformShare: new Prisma.Decimal(pricingResult.splits.totalPlatformRevenue),

        customerId: order.customerId,
        merchantId: order.merchantId,
      },
    });

    await this.prisma.foodOrder.update({
      where: { id: orderId },
      data: { shipmentId: shipment.id },
    });

    return updatedOrder;
  }

  /**
   * Get all food orders for a customer
   */
  async getCustomerOrders(userId: string) {
    const orders = await this.prisma.foodOrder.findMany({
      where: { customerId: userId },
      include: {
        merchant: {
          select: {
            id: true,
            businessName: true,
            logoUrl: true,
            address: true,
          },
        },
        shipment: {
          select: {
            id: true,
            trackingCode: true,
            status: true,
            rider: {
              select: {
                id: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                  },
                },
                activeVehicle: true,
              },
            },
          },
        },
        items: {
          include: {
            foodItem: {
              select: {
                name: true,
                imageUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      count: orders.length,
      orders: orders.map((order) => ({
        ...order,
        restaurant: order.merchant,
        totalAmount: Number(order.totalPrice ?? 0),
        shipment: order.shipment ? {
          ...order.shipment,
          rider: order.shipment.rider ? {
            ...order.shipment.rider,
            user: {
              ...order.shipment.rider.user,
              fullName: `${order.shipment.rider.user.firstName ?? ''} ${order.shipment.rider.user.lastName ?? ''}`.trim(),
            },
          } : null,
        } : null,
      })),
    };
  }

  /**
   * Get specific food order tracking details for a customer
   */
  async getCustomerOrderById(orderId: string, userId: string) {
    const order = await this.prisma.foodOrder.findUnique({
      where: { id: orderId },
      include: {
        merchant: {
          select: {
            id: true,
            businessName: true,
            logoUrl: true,
            phone: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        shipment: {
          include: {
            rider: {
              include: {
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    phoneNumber: true,
                    avatarUrl: true,
                  },
                },
                activeVehicle: true,
              },
            },
            timelineEvents: {
              orderBy: { createdAt: 'asc' },
            },
          },
        },
        items: {
          include: {
            foodItem: {
              select: {
                name: true,
                price: true,
                imageUrl: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Food order not found.');
    }

    if (order.customerId !== userId) {
      throw new ForbiddenException('You do not have access to view this order.');
    }

    const riderUser = order.shipment?.rider?.user;
    const riderFullName = riderUser 
      ? `${riderUser.firstName ?? ''} ${riderUser.lastName ?? ''}`.trim() 
      : null;

    return {
      success: true,
      order: {
        id: order.id,
        status: order.status,
        deliveryStatus: order.deliveryStatus,
        subtotal: Number(order.subTotal ?? 0),
        deliveryFee: Number(order.deliveryFee ?? 0),
        serviceFee: Number(order.serviceFee ?? 0),
        totalAmount: Number(order.totalPrice ?? 0),
        deliveryAddress: order.deliveryAddress,
        deliveryNotes: order.deliveryInstructions,
        createdAt: order.createdAt,
        restaurant: {
          id: order.merchant?.id,
          name: order.merchant?.businessName,
          logoUrl: order.merchant?.logoUrl,
          phone: order.merchant?.phone,
          address: order.merchant?.address,
          latitude: order.merchant?.latitude,
          longitude: order.merchant?.longitude,
        },
        items: order.items.map((item) => ({
          ...item,
          price: Number(item.price),
        })),
        shipment: order.shipment ? {
          id: order.shipment.id,
          trackingCode: order.shipment.trackingCode,
          status: order.shipment.status,
          verificationPin: order.shipment.verificationPin,
          estimatedMinutes: order.shipment.estimatedMinutes,
          distanceKm: order.shipment.distanceKm,
          pickupCoordinates: {
            latitude: order.shipment.pickupLat,
            longitude: order.shipment.pickupLng,
            address: order.shipment.pickupAddress,
          },
          destinationCoordinates: {
            latitude: order.shipment.destinationLat,
            longitude: order.shipment.destinationLng,
            address: order.shipment.destinationAddress,
          },
          rider: order.shipment.rider ? {
            name: riderFullName,
            phone: order.shipment.rider.user.phoneNumber,
            avatarUrl: order.shipment.rider.user.avatarUrl,
            vehicle: order.shipment.rider.activeVehicle,
          } : null,
          timeline: order.shipment.timelineEvents,
        } : null,
      },
    };
  }
}