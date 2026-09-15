import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { CreateMenuItemDto, UpdateMenuItemDto } from './menu.dto';
import { NotificationService } from 'src/notification/notification.service';

@Injectable()
export class MerchantDashboardService {
  constructor(private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
  ) {}

async getDashboardOverview(userId: string) {
  const profile = await this.prisma.merchantProfile.findUnique({
    where: { userId },
  });

  if (!profile) throw new NotFoundException('Merchant profile not found');

  const foodOrders = await (this.prisma as any).foodOrder.findMany({
    where: { merchantId: profile.id },
    include: {
      items: true,
      shipment: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayOrders = foodOrders.filter((ord: any) => new Date(ord.createdAt) >= todayStart);
  const ordersCount = todayOrders.length;
  // Revenue strictly from merchant share fallback calculation
  const revenue = todayOrders.reduce(
    (sum, ord) => sum + Number(ord.merchantShare ?? (Number(ord.subTotal || 0) * 0.9)),
    0,
  );

  return {
    storeName: profile.businessName,
    isStoreOpen: profile.isOpen ?? true,
    metrics: {
      ordersCount,
      revenue,
      rating: 4.8,
    },
    pipelineCounts: {
      new: foodOrders.filter((o: any) => o.status === 'PENDING').length,
      preparing: foodOrders.filter((o: any) => o.status === 'ACCEPTED' || o.status === 'PREPARING').length,
      ready: foodOrders.filter((o: any) => o.status === 'READY_FOR_PICKUP' || o.status === 'ARRIVED_AT_HUB' || o.status === 'READY').length,
      delivery: foodOrders.filter((o: any) => o.status === 'OUT_FOR_DELIVERY' || o.deliveryStatus === 'OUT_FOR_DELIVERY').length,
    },
    orders: foodOrders.map((ord: any) => {
      const netMerchantShare = Number(ord.merchantShare ?? (Number(ord.subTotal || 0) * 0.9));
      return {
        id: ord.id,
        orderNumber: ord.orderNumber,
        createdAt: ord.createdAt,
        subTotal: netMerchantShare, // Overwritten to reflect net payout
        merchantShare: netMerchantShare,
        grossSubTotal: Number(ord.subTotal || 0),
        totalPrice: Number(ord.totalPrice || 0), // Customer paid total (retained for reference)
        status: ord.status,
        deliveryStatus: ord.deliveryStatus,
        deliveryAddress: ord.deliveryAddress,
        items: ord.items,
        shipment: ord.shipment,
      };
    }),
  };
}
private getCurrentDayName(): string {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const now = new Date();
    return days[now.getDay()];
  }

  async toggleStoreStatus(userId: string, isOpen: boolean) {
    const profile = await this.prisma.merchantProfile.findUnique({ 
      where: { userId },
      include: { operatingHours: true },
    });
    if (!profile) throw new NotFoundException('Merchant profile not found');

    if (isOpen) {
      const currentDay = this.getCurrentDayName().toUpperCase();
      const todayHour = profile.operatingHours.find(
        (h) => h.dayOfWeek.toUpperCase() === currentDay
      );

      if (todayHour && todayHour.isClosed) {
        throw new BadRequestException(`Cannot go online: Your operating hours show you are closed on ${currentDay}.`);
      }
    }

    return this.prisma.merchantProfile.update({
      where: { id: profile.id },
      data: { isOpen },
    });
  }
async updateOrderStatus(userId: string, orderId: string, status: any) {
  const profile = await this.prisma.merchantProfile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundException('Merchant profile not found');

  const foodOrder = await (this.prisma as any).foodOrder.findFirst({
    where: {
      OR: [
        { id: orderId, merchantId: profile.id },
        { shipmentId: orderId, merchantId: profile.id },
      ],
    },
    include: { merchant: true }, // Ensure merchant is included so we can access merchant.userId
  });

  if (!foodOrder) throw new NotFoundException('Food order not found');

  const upperStatus = String(status).toUpperCase();
  let foodOrderStatus = upperStatus;

  if (upperStatus === 'ACCEPTED') {
    foodOrderStatus = 'ACCEPTED';
  } else if (upperStatus === 'PREPARING') {
    foodOrderStatus = 'PREPARING';
  } else if (upperStatus === 'READY' || upperStatus === 'READY_FOR_PICKUP' || upperStatus === 'ARRIVED_AT_HUB') {
    foodOrderStatus = 'READY';
  } else if (upperStatus === 'COMPLETED' || upperStatus === 'DELIVERED') {
    foodOrderStatus = 'COMPLETED';
  } else if (upperStatus === 'CANCELLED' || upperStatus === 'REJECTED') {
    foodOrderStatus = 'CANCELLED';
  }

  // Use a Prisma transaction to handle order update, wallet funding, and ledger creation atomically
  return this.prisma.$transaction(async (tx) => {
    // 1. Update the food order status
    const updatedOrder = await (tx as any).foodOrder.update({
      where: { id: foodOrder.id },
      data: { 
        status: foodOrderStatus as any,
        ...(foodOrderStatus === 'COMPLETED' ? { deliveryStatus: 'DELIVERED', deliveredAt: new Date() } : {}),
      },
    });

    // 2. If the order is marked COMPLETED, fund the merchant's wallet & create a transaction ledger
    if (foodOrderStatus === 'COMPLETED') {
      const merchantUserId = foodOrder.merchant?.userId || profile.userId;

      // Find or create the merchant's wallet using the merchant's userId
      const wallet = await tx.wallet.upsert({
        where: { userId: merchantUserId },
        create: {
          userId: merchantUserId,
          availableBalance: foodOrder.totalPrice,
        },
        update: {
          availableBalance: { increment: foodOrder.totalPrice },
        },
      });

      // Create a transaction ledger record (make sure the referenceCode has a unique constraint fallback)
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: foodOrder.totalPrice,
          type: 'CREDIT',
          category: 'DELIVERY_PAYMENT',
          referenceCode: `MERCH-ORD-${foodOrder.orderNumber}-${Date.now()}`,
          description: `Earnings for completed order ${foodOrder.orderNumber}`,
        },
      });
    }

    return updatedOrder;
  });
}
  async getMenu(userId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Merchant profile not found');

    return this.prisma.foodItem.findMany({
      where: { merchantId: profile.id },
      orderBy: { createdAt: 'desc' },
    });
  }


  

async createMenuItem(userId: string, dto: CreateMenuItemDto) {
  const profile = await (this.prisma as any).merchantProfile.findUnique({
    where: { userId },
  });
  if (!profile) throw new NotFoundException('Merchant profile not found');

  const subcategory = await (this.prisma as any).foodSubcategory.findUnique({
    where: { id: dto.subcategoryId },
  });
  if (!subcategory) {
    throw new BadRequestException('Selected subcategory taxonomy is invalid or does not exist');
  }

  // Use a Prisma transaction to save the item and its option groups/options cleanly
const menuItem = await this.prisma.$transaction(async (tx: any) => {
  return tx.foodItem.create({
    data: {
      merchantId: profile.id,
      name: dto.name,
      description: dto.description,
      price: dto.price,
      subcategoryId: dto.subcategoryId,
      imageUrl: dto.imageUrl || '',
      isAvailable: dto.available ?? true,
      category: subcategory.name,
      customizationGroups: dto.customizationGroups?.length ? {
        create: dto.customizationGroups.map((group) => ({
          name: group.name,
          selectionType: group.selectionType,
          minSelections: group.minSelections,
          maxSelections: group.maxSelections,
          options: {
            create: group.options.map((opt) => ({
              name: opt.name,
              price: opt.price,
              isAvailable: opt.isAvailable ?? true,
            })),
          },
        })),
      } : undefined,
    },
    include: {
      customizationGroups: {
        include: { options: true },
      },
    },
  });
}, {
  maxWait: 10000, // default is 2000ms: max time transaction waits to be allocated
  timeout: 10000, // default is 5000ms: max time transaction can run before expiring
});

  // Notification logic remains non-blocking...
  try {
    const customers = await this.prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: { id: true },
      take: 50,
    });

    const merchantName = profile.businessName || profile.name || 'A merchant';
    const title = `🍽️ New Menu Item from ${merchantName}!`;
    const body = `Check out "${dto.name}" now available on Aviorè Go. Tap to order!`;

    await Promise.all(
      customers.map((customer) =>
        this.notificationService.dispatch({
          type: 'SYSTEM_ALERT' as any,
          userId: customer.id,
          title,
          body,
          data: {
            url: `/merchant/${profile.id}`,
            itemId: menuItem.id,
          },
        }).catch((err) => console.error(`Failed to notify user ${customer.id}:`, err))
      ),
    );
  } catch (notifErr) {
    console.error('[Menu Notification Error]:', notifErr);
  }

  return menuItem;
}

async updateMenuItem(userId: string, id: string, dto: UpdateMenuItemDto) {
  const profile = await (this.prisma as any).merchantProfile.findUnique({
    where: { userId },
  });
  if (!profile) throw new NotFoundException('Merchant profile not found');

  const item = await (this.prisma as any).foodItem.findFirst({
    where: { id, merchantId: profile.id },
  });
  if (!item) throw new NotFoundException('Menu item not found or unauthorized');

  let categoryName: string | undefined = undefined;
  let subcategoryIdToUpdate: string | undefined = undefined;

  if (dto.subcategoryId && dto.subcategoryId.trim() !== '') {
    const subcategory = await (this.prisma as any).foodSubcategory.findUnique({
      where: { id: dto.subcategoryId },
    });
    if (!subcategory) {
      throw new BadRequestException('Selected subcategory taxonomy is invalid or does not exist');
    }
    categoryName = subcategory.name;
    subcategoryIdToUpdate = dto.subcategoryId;
  }

  return (this.prisma as any).foodItem.update({
    where: { id },
    data: {
      name: dto.name,
      price: dto.price,
      ...(subcategoryIdToUpdate ? { subcategoryId: subcategoryIdToUpdate } : {}),
      imageUrl: dto.imageUrl,
      isAvailable: dto.available,
      ...(categoryName ? { category: categoryName } : {}),
    },
  });
}
  async deleteMenuItem(userId: string, id: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });
    if (!profile) throw new NotFoundException('Merchant profile not found');

    const item = await this.prisma.foodItem.findFirst({
      where: { id, merchantId: profile.id },
    });
    if (!item) throw new NotFoundException('Menu item not found or unauthorized');

    await this.prisma.foodItem.delete({ where: { id } });
    return { success: true, message: 'Menu item deleted successfully' };
  }
async getNotificationSettings(userId: string) {
  const merchant = await this.prisma.merchantProfile.findUnique({
    where: { userId },
    select: { notificationSettings: true },
  });
  return merchant?.notificationSettings || {
    newOrders: true,
    riderAssigned: true,
    payoutAlerts: true,
    customerReviews: false,
    marketingPromos: false,
  };
}

async updateNotificationSettings(userId: string, settings: any) {
  return this.prisma.merchantProfile.update({
    where: { userId },
    data: { notificationSettings: settings },
  });
}

async getReviews(userId: string) {
  const merchantProfile = await this.prisma.merchantProfile.findUnique({
    where: { userId },
    include: {
      reviews: {
        include: {
          reviewer: { select: { firstName: true, lastName: true } },
          shipment: { select: { description: true, marketplaceOrderId: true } }
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!merchantProfile) return { reviews: [], averageRating: "0.0", totalCount: 0 };

  const reviews = merchantProfile.reviews;
  const totalCount = reviews.length;
  const averageRating = totalCount > 0 
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / totalCount).toFixed(1) 
    : "0.0";

  return { 
    reviews: reviews.map(r => ({
      id: r.id,
      customer: `${r.reviewer.firstName[0]}. ${r.reviewer.lastName[0]}.`,
      rating: r.rating,
      comment: r.comment || "",
      date: new Date(r.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      item: r.shipment?.description || "Marketplace Order"
    })), 
    averageRating, 
    totalCount 
  };
}


  
}