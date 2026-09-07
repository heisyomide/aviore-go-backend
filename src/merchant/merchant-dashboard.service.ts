import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { CreateMenuItemDto, UpdateMenuItemDto } from './menu.dto';

@Injectable()
export class MerchantDashboardService {
  constructor(private readonly prisma: PrismaService) {}

async getDashboardOverview(userId: string) {
    const profile = await this.prisma.merchantProfile.findUnique({
      where: { userId },
    });

    if (!profile) throw new NotFoundException('Merchant profile not found');

    // Fetch unified FoodOrders along with their linked Shipments and items
    const foodOrders = await (this.prisma as any).foodOrder.findMany({
      where: { merchantId: profile.id },
      include: {
        items: true,
        shipment: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const todayOrdersCount = foodOrders.length;
    const todayRevenue = foodOrders.reduce((sum, ord) => sum + Number(ord.totalPrice || 0), 0);

    return {
      storeName: profile.businessName,
      isStoreOpen: profile.isOpen ?? true,
      metrics: {
        ordersCount: todayOrdersCount,
        revenue: todayRevenue,
        rating: 4.8,
      },
      pipelineCounts: {
        new: foodOrders.filter((o: any) => o.status === 'PENDING').length,
        preparing: foodOrders.filter((o: any) => o.status === 'ACCEPTED' || o.status === 'PREPARING').length,
        ready: foodOrders.filter((o: any) => o.status === 'READY_FOR_PICKUP').length,
        delivery: foodOrders.filter((o: any) => o.status === 'OUT_FOR_DELIVERY' || o.deliveryStatus === 'OUT_FOR_DELIVERY').length,
      },
      orders: foodOrders.map((ord: any) => ({
        id: ord.id,
        orderNumber: ord.orderNumber,
        createdAt: ord.createdAt,
        totalPrice: ord.totalPrice,
        status: ord.status,
        deliveryStatus: ord.deliveryStatus,
        deliveryAddress: ord.deliveryAddress,
        items: ord.items,
        shipment: ord.shipment,
      })),
    };
  }

  async toggleStoreStatus(userId: string, isOpen: boolean) {
    const profile = await this.prisma.merchantProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Merchant profile not found');

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
    });

    if (!foodOrder) throw new NotFoundException('Food order not found');

    let shipmentStatus: string | undefined = undefined;
    if (status === 'ACCEPTED' || status === 'PREPARING') {
      shipmentStatus = 'ACCEPTED';
    } else if (status === 'READY_FOR_PICKUP') {
      shipmentStatus = 'ARRIVED_AT_HUB';
    } else if (status === 'CANCELLED') {
      shipmentStatus = 'CANCELLED';
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedOrder = await (tx as any).foodOrder.update({
        where: { id: foodOrder.id },
        data: { status },
      });

      if (foodOrder.shipmentId) {
        await tx.shipment.update({
          where: { id: foodOrder.shipmentId },
          data: { ...(shipmentStatus ? { status: shipmentStatus as any } : {}) },
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

    // Enforce rigid taxonomy rule: Subcategory must exist
    const subcategory = await (this.prisma as any).foodSubcategory.findUnique({
      where: { id: dto.subcategoryId },
    });
    if (!subcategory) {
      throw new BadRequestException('Selected subcategory taxonomy is invalid or does not exist');
    }

    return (this.prisma as any).foodItem.create({
      data: {
        merchantId: profile.id,
        name: dto.name,
        price: dto.price,
        subcategoryId: dto.subcategoryId,
        imageUrl: dto.imageUrl || '',
        isAvailable: dto.available ?? true,
        category: subcategory.name, // Satisfies the required Prisma string field
      },
    });
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