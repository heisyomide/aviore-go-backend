import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

  async getHomePageData(lat?: number, lng?: number, category?: string) {
    const categoryFilter = category && category !== 'all' 
      ? { cuisineType: { contains: category, mode: 'insensitive' as const } } 
      : {};

    const [
      featuredMerchants,
      nearbyMerchants,
      popularDishes,
      upcomingEvents,
    ] = await Promise.all([
      this.prisma.merchantProfile.findMany({
        where: { isOpen: true, isOnboardingComplete: true, ...categoryFilter },
        take: 6,
        select: {
          id: true,
          businessName: true,
          cuisineType: true,
          logoUrl: true,
          coverUrl: true,
          address: true,
        },
      }),
      this.prisma.merchantProfile.findMany({
        where: { isOpen: true, isOnboardingComplete: true, ...categoryFilter },
        take: 6,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          businessName: true,
          cuisineType: true,
          logoUrl: true,
          coverUrl: true,
          address: true,
        },
      }),
      this.prisma.foodItem.findMany({
        where: { isAvailable: true },
        take: 8,
        include: {
          merchant: {
            select: {
              id: true,
              businessName: true,
            },
          },
        },
      }),
      this.prisma.event.findMany({
        where: { status: 'PUBLISHED', startDate: { gte: new Date() } },
        take: 5,
        orderBy: { startDate: 'asc' },
      }),
    ]);

    return {
      featuredMerchants,
      nearbyMerchants,
      popularDishes,
      upcomingEvents,
    };
  }

async getMerchantById(id: string) {
    const merchant = await this.prisma.merchantProfile.findUnique({
      where: { id },
      include: {
        menuItems: {
          where: { isAvailable: true },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            imageUrl: true,
            category: true,
            subCategory: {
              select: { id: true, name: true },
            },
            customizationGroups: {
              include: {
                options: true,
              },
            },
          },
        },
      },
    });

    if (!merchant) {
      throw new NotFoundException(`Merchant with ID '${id}' not found.`);
    }

    return merchant;
  }

  async searchMarketplace(query: string) {
    if (!query) return { merchants: [], foodItems: [] };

    const [merchants, foodItems] = await Promise.all([
      this.prisma.merchantProfile.findMany({
        where: {
          businessName: { contains: query, mode: 'insensitive' },
          isOpen: true,
        },
        take: 5,
      }),
      this.prisma.foodItem.findMany({
        where: {
          name: { contains: query, mode: 'insensitive' },
          isAvailable: true,
        },
        take: 10,
        include: {
          merchant: {
            select: {
              businessName: true,
              id: true,
            },
          },
        },
      }),
    ]);

    return { merchants, foodItems };
  }

  async getAllFoodMerchants(search?: string) {
    return this.prisma.merchantProfile.findMany({
      where: {
        isOpen: true,
        ...(search ? {
          OR: [
            { businessName: { contains: search, mode: 'insensitive' as const } },
            { address: { contains: search, mode: 'insensitive' as const } },
            { cuisineType: { contains: search, mode: 'insensitive' as const } },
          ]
        } : {})
      },
      include: {
        _count: {
          select: { menuItems: true }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAvailableCategories() {
    const foodItems = await this.prisma.foodItem.findMany({
      where: { isAvailable: true },
      select: { 
        category: true, 
        subCategory: { select: { name: true } } 
      },
    });

    const categorySet = new Set<string>();
    foodItems.forEach(item => {
      if (item.category && typeof item.category === 'string') {
        categorySet.add(item.category);
      }
      if (item.subCategory && typeof item.subCategory === 'object' && 'name' in item.subCategory) {
        categorySet.add((item.subCategory as { name: string }).name);
      }
    });

    return Array.from(categorySet);
  }

  async getMerchantStorefront(merchantId: string) {
    try {
      const merchant = await (this.prisma as any).merchantProfile.findUnique({
        where: { id: merchantId },
        include: {
          user: {
            select: { 
              email: true, 
              phoneNumber: true 
            }
          }
        }
      });

      if (!merchant) {
        throw new NotFoundException('Merchant storefront not found');
      }

      return merchant;
    } catch (error) {
      console.error("Error fetching merchant storefront:", error);
      throw error;
    }
  }

  async getMerchantMenu(merchantId: string) {
    return (this.prisma as any).foodItem.findMany({
      where: { 
        merchantId, 
        isAvailable: true 
      },
      include: {
        subCategory: true,
        customizationGroups: {
          include: {
            options: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}