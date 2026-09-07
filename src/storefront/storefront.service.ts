import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';

@Injectable()
export class StorefrontService {
  constructor(private readonly prisma: PrismaService) {}

 async getHomePageData(lat?: number, lng?: number, category?: string) {
  // Map category slug from frontend to database matching values if needed
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

async getFoodItemsByCategory(category?: string) {
    if (!category || category === 'all') {
      return this.prisma.foodItem.findMany({
        where: { isAvailable: true },
        take: 20,
        include: {
          merchant: { select: { id: true, businessName: true, address: true } },
          subCategory: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // Split slug into words (e.g., "rice-rice-meals" -> ["rice", "meals"])
    const searchTerms = category.replace(/-/g, ' ').split(' ').filter(Boolean);

    return this.prisma.foodItem.findMany({
      where: {
        isAvailable: true,
        OR: searchTerms.flatMap(term => [
          { category: { contains: term, mode: 'insensitive' as const } },
          { subCategory: { name: { contains: term, mode: 'insensitive' as const } } },
          { subCategory: { slug: { contains: term, mode: 'insensitive' as const } } },
        ]),
      },
      take: 20,
      include: {
        merchant: { select: { id: true, businessName: true, address: true } },
        subCategory: true,
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
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  

}