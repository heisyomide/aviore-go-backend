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
    const orderItemsData: any[] = [];

    for (const itemDto of dto.items) {
      const itemId = (itemDto as any).foodItemId || (itemDto as any).menuItemId;

      const foodItem = await this.prisma.foodItem.findUnique({
        where: { id: itemId },
      });

      if (!foodItem || !foodItem.isAvailable) {
        throw new BadRequestException(`Food item with ID ${itemId} is not available.`);
      }

      let itemBasePrice = Number(foodItem.price);
      let itemCustomizationSum = 0;
      const processedCustomizationOptions: any[] = [];

      if (itemDto.customizationOptions && Array.isArray(itemDto.customizationOptions)) {
        for (const customOptionDto of itemDto.customizationOptions) {
          const optionRecord = await (this.prisma as any).foodItemOption.findUnique({
            where: { id: customOptionDto.optionId },
          });

          if (!optionRecord) {
            throw new BadRequestException(`Customization option with ID ${customOptionDto.optionId} not found.`);
          }

          const optPrice = Number(optionRecord.price || 0);
          const optQty = Number(customOptionDto.quantity || 1);
          itemCustomizationSum += optPrice * optQty;

          processedCustomizationOptions.push({
            optionId: optionRecord.id,
            quantity: optQty,
          });
        }
      }

      const itemTotal = (itemBasePrice + itemCustomizationSum) * itemDto.quantity;
      subTotal += itemTotal;

      orderItemsData.push({
        foodItemId: foodItem.id,
        name: foodItem.name,
        price: itemBasePrice,
        quantity: itemDto.quantity,
        selectedAddOns: itemDto.selectedAddOns ?? undefined,
        customizationOptions: processedCustomizationOptions.length > 0 ? {
          create: processedCustomizationOptions
        } : undefined,
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

    const foodOrder = await (this.prisma as any).foodOrder.create({
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
          create: orderItemsData.map((item) => ({
            foodItemId: item.foodItemId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            selectedAddOns: item.selectedAddOns,
            customizationOptions: item.customizationOptions,
          })),
        },
      },
      include: {
        items: { 
          include: { 
            foodItem: true,
            customizationOptions: {
              include: { option: true }
            }
          } 
        },
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
    const order = await (this.prisma as any).foodOrder.findUnique({
      where: { id: orderId },
      include: { merchant: true, customer: true },
    });

    if (!order) {
      throw new NotFoundException('Food order not found.');
    }

    const updatedOrder = await (this.prisma as any).foodOrder.update({
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

    await (this.prisma as any).foodOrder.update({
      where: { id: orderId },
      data: { shipmentId: shipment.id },
    });

    return updatedOrder;
  }

  /**
   * Get all food orders for a customer
   */
async getCustomerOrders(userId: string) {
    const orders = await (this.prisma as any).foodOrder.findMany({
      where: { customerId: userId },
      include: {
        merchant: {
          select: {
            id: true,
            businessName: true,
            logoUrl: true,
            address: true,
            phone: true, // Added merchant phone for frontend usage
          },
        },
        shipment: {
          select: {
            id: true,
            trackingCode: true,
            status: true,
            verificationPin: true, // Include PIN for customer view matching frontend
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
      orders: (orders as any[]).map((order) => {
    const hasRider = Boolean(order.shipment?.rider);
    const foodStatus = order.status;
    const deliveryStatus = order.deliveryStatus;
    const shipmentStatus = order.shipment?.status;
    let statusMessage = 'Processing your order...';

    if (foodStatus === 'CANCELLED') {
      statusMessage = 'This order has been cancelled.';
    } else if (foodStatus === 'DELIVERED' || deliveryStatus === 'DELIVERED') {
      statusMessage = 'Your order has been delivered successfully.';
    } else if (shipmentStatus === 'OUT_FOR_DELIVERY') {
      statusMessage = 'Your rider has arrived at your destination! Please prepare your PIN.';
    } else if (deliveryStatus === 'ARRIVED_AT_PICKUP' || deliveryStatus === 'ARRIVED') {
      statusMessage = 'Your rider has arrived at the restaurant pickup location.';
    } else if (deliveryStatus === 'PICKED_UP' || deliveryStatus === 'IN_TRANSIT' || shipmentStatus === 'IN_TRANSIT') {
      statusMessage = 'Your order has been picked up and is on the way to you.';
    } else if (foodStatus === 'READY') {
      statusMessage = hasRider 
        ? 'Your food is ready and your rider is heading to pickup.' 
        : 'Your food is ready! We are currently matching you with a nearby rider.';
    } else if (foodStatus === 'PREPARING') {
      statusMessage = 'The restaurant is currently preparing your meal.';
    } else if (foodStatus === 'ACCEPTED') {
      statusMessage = 'Your order has been accepted by the restaurant.';
    }


        return {
          ...order,
          statusMessage,
          restaurant: {
            ...order.merchant,
            name: order.merchant?.businessName, // Map businessName to name for frontend component
          },
          totalAmount: Number(order.totalPrice ?? 0),
          subtotal: Number(order.subtotal ?? 0),
          deliveryFee: Number(order.deliveryFee ?? 0),
          serviceFee: Number(order.serviceFee ?? 0),
          items: (order.items ?? []).map((item: any) => ({
            ...item,
            price: Number(item.price),
            customizationOptions: Array.isArray(item.customizationOptions)
              ? item.customizationOptions.map((opt: any) => ({
                  ...opt,
                  option: {
                    ...opt.option,
                    price: Number(opt.option?.price || 0),
                  },
                }))
              : [],
          })),
          shipment: order.shipment ? {
            ...order.shipment,
            rider: order.shipment.rider ? {
              ...order.shipment.rider,
              phone: order.shipment.rider.user?.phoneNumber, // Map phone field directly for frontend
              avatarUrl: null, // Add if available in profile
              vehicle: order.shipment.rider.activeVehicle, // Map activeVehicle to vehicle expected by frontend
              user: {
                ...order.shipment.rider.user,
                name: `${order.shipment.rider.user.firstName ?? ''} ${order.shipment.rider.user.lastName ?? ''}`.trim(),
              },
            } : null,
          } : null,
        };
      }),
    };
  }

  /**
   * Get specific food order tracking details for a customer with dynamic status messaging
   */
async getCustomerOrderById(orderId: string, userId: string) {
    const order = await (this.prisma as any).foodOrder.findUnique({
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

    const hasRider = Boolean(order.shipment?.rider);
    const foodStatus = order.status;
    const deliveryStatus = order.deliveryStatus;
    const shipmentStatus = order.shipment?.status;
    let statusMessage = 'Processing your order...';

    if (foodStatus === 'CANCELLED') {
      statusMessage = 'This order has been cancelled.';
    } else if (foodStatus === 'DELIVERED' || deliveryStatus === 'DELIVERED') {
      statusMessage = 'Your order has been delivered successfully.';
    } else if (shipmentStatus === 'OUT_FOR_DELIVERY') {
      statusMessage = 'Your rider has arrived at your destination! Please prepare your PIN.';
    } else if (deliveryStatus === 'ARRIVED_AT_PICKUP' || deliveryStatus === 'ARRIVED') {
      statusMessage = 'Your rider has arrived at the restaurant pickup location.';
    } else if (deliveryStatus === 'PICKED_UP' || deliveryStatus === 'IN_TRANSIT' || shipmentStatus === 'IN_TRANSIT') {
      statusMessage = 'Your order has been picked up and is on the way to you.';
    } else if (foodStatus === 'READY') {
      statusMessage = hasRider 
        ? 'Your food is ready and your rider is heading to pickup.' 
        : 'Your food is ready! We are currently matching you with a nearby rider.';
    } else if (foodStatus === 'PREPARING') {
      statusMessage = 'The restaurant is currently preparing your meal.';
    } else if (foodStatus === 'ACCEPTED') {
      statusMessage = 'Your order has been accepted by the restaurant.';
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
        statusMessage,
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
        items: (order.items as any[]).map((item) => ({
          ...item,
          price: Number(item.price),
          customizationOptions: Array.isArray(item.customizationOptions) 
            ? item.customizationOptions.map((opt: any) => ({
                ...opt,
                option: {
                  ...opt.option,
                  price: Number(opt.option?.price || 0)
                }
              }))
            : []
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