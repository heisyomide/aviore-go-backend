import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { FoodPricingService } from '../pricing/food-pricing.service';
import { SavedAddress } from '@prisma/client';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foodPricingService: FoodPricingService,
  ) {}

  async getCart(userId: string, merchantId: string) {
    const targetUserId = userId || 'anonymous-guest-user';

    let defaultAddress: SavedAddress | null = null;
    const isAnonymous = !userId || userId === 'anonymous-guest-user';

    if (!isAnonymous) {
      defaultAddress = await this.prisma.savedAddress.findFirst({
        where: { userId, isDefault: true },
      }) || await this.prisma.savedAddress.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
    }

    const userLat = defaultAddress?.latitude != null ? Number(defaultAddress.latitude) : null;
    const userLng = defaultAddress?.longitude != null ? Number(defaultAddress.longitude) : null;

    const cartQueryArgs = {
      where: { userId_merchantId: { userId: targetUserId, merchantId } },
      include: {
        items: {
          include: { 
            foodItem: { include: { merchant: true } },
            customizationOptions: { 
              include: {
                option: true 
              }
            }
          }
        }
      }
    };

    let cart = await this.prisma.cart.findUnique(cartQueryArgs);

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId: targetUserId, merchantId },
        include: cartQueryArgs.include,
      });
    }

    if (!cart) {
      throw new BadRequestException('Could not retrieve or create cart.');
    }

    // Map items with explicit canonical lineTotals calculated on the backend
// Fixed pricing model inside getCart()
  const itemsWithTotals = cart.items.map((item) => {
    const foodSubtotal = Number(item.foodItem?.price || 0) * Number(item.quantity || 1);
    
    const customizationTotal = (item.customizationOptions as Array<any>)?.reduce((total, customOpt) => {
      const optionPrice = Number(customOpt.option?.price || 0);
      const optionQty = Number(customOpt.quantity || 1);
      return total + (optionPrice * optionQty);
    }, 0) || 0;

    const lineTotal = foodSubtotal + customizationTotal;

    return {
      ...item,
      foodSubtotal,
      customizationTotal,
      lineTotal,
    };
  });

    const subtotal = itemsWithTotals.reduce((acc, item) => acc + item.lineTotal, 0);

    let deliveryFee = 0;
    let distanceKm = 0;
    let estimatedMinutes = 0;
    let breakdown = { baseFee: 500, deliveryDistanceFee: 0 };

    const merchant = cart.items[0]?.foodItem?.merchant || await this.prisma.merchantProfile.findUnique({ where: { id: merchantId } });

    if (merchant && merchant.latitude != null && merchant.longitude != null && userLat != null && userLng != null) {
      const pricing = this.foodPricingService.calculateFoodOrderPricing({
        pickupLat: Number(merchant.latitude),
        pickupLng: Number(merchant.longitude),
        destinationLat: userLat,
        destinationLng: userLng,
        foodSubtotal: subtotal,
      });

      deliveryFee = pricing.deliveryFee;
      distanceKm = pricing.distanceKm;
      estimatedMinutes = pricing.estimatedMinutes;
      breakdown = {
        baseFee: pricing.breakdown.baseFee,
        deliveryDistanceFee: pricing.breakdown.deliveryDistanceFee,
      };
    }

    return {
      ...cart,
      items: itemsWithTotals,
      subtotal,
      deliveryFee,
      distanceKm,
      estimatedMinutes,
      breakdown,
      total: subtotal + (subtotal > 0 ? deliveryFee : 0),
    };
  }

  async addItemToCart(
    userId: string, 
    merchantId: string, 
    foodItemId: string, 
    quantity: number = 1, 
    customizations: Array<{ optionId: string; quantity: number }> = [],
    customizationOptionIds: string[] = [] // Fallback backward compatibility
  ) {
    const targetUserId = userId || 'anonymous-guest-user';

    const foodItem = await this.prisma.foodItem.findUnique({ where: { id: foodItemId } });
    if (!foodItem || foodItem.merchantId !== merchantId) {
      throw new BadRequestException('Food item does not belong to this merchant restaurant.');
    }

    const cart = await this.prisma.cart.upsert({
      where: { userId_merchantId: { userId: targetUserId, merchantId } },
      update: {},
      create: { userId: targetUserId, merchantId },
    });

    // Normalize customizations structure if fallback IDs array was sent
    let normalizedCustomizations = customizations;
    if ((!customizations || customizations.length === 0) && customizationOptionIds.length > 0) {
      const counts: Record<string, number> = {};
      customizationOptionIds.forEach(id => {
        counts[id] = (counts[id] || 0) + 1;
      });
      normalizedCustomizations = Object.entries(counts).map(([optionId, qty]) => ({
        optionId,
        quantity: qty
      }));
    }

    await this.prisma.cartItem.create({
      data: {
        cartId: cart.id,
        foodItemId,
        quantity,
        customizationOptions: {
          create: normalizedCustomizations.map((cust) => ({
            customizationOptionId: cust.optionId,
            quantity: cust.quantity || 1,
          })),
        },
      },
    });

    return this.getCart(targetUserId, merchantId);
  }

async updateCartItem(
    userId: string,
    merchantId: string,
    cartItemId: string,
    quantity: number,
    customizations: Array<{ optionId: string; quantity: number }> = []
  ) {
    const targetUserId = userId || 'anonymous-guest-user';

    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        id: cartItemId,
        cart: {
          userId: targetUserId,
          merchantId,
        }
      },
      include: {
        foodItem: {
          include: {
            customizationGroups: {
              include: { options: true }
            }
          } as any
        }
      }
    });

    if (!cartItem) {
      throw new BadRequestException('Cart item not found or unauthorized.');
    }

    const foodItemWithGroups = cartItem.foodItem as any;
    const validOptionIds = new Set(
      foodItemWithGroups.customizationGroups?.flatMap((g: any) => g.options.map((o: any) => o.id)) || []
    );

    for (const cust of customizations) {
      if (!validOptionIds.has(cust.optionId)) {
        throw new BadRequestException(`Option ${cust.optionId} does not belong to this food item.`);
      }
    }

    return await this.prisma.$transaction(async (prisma: any) => {
      await prisma.cartItemCustomization.deleteMany({
        where: { cartItemId }
      });

      await prisma.cartItem.update({
        where: { id: cartItemId },
        data: {
          quantity,
          customizationOptions: {
            create: customizations.map(c => ({
              customizationOptionId: c.optionId,
              quantity: c.quantity || 1,
            }))
          }
        }
      });

      return this.getCart(targetUserId, merchantId);
    });
  }
  async updateQuantity(userId: string, merchantId: string, cartItemId: string, quantity: number) {
    if (quantity < 1) {
      return this.removeCartItem(userId, merchantId, cartItemId);
    }

    const targetUserId = userId || 'anonymous-guest-user';

    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        id: cartItemId,
        cart: { userId: targetUserId, merchantId }
      }
    });

    if (!cartItem) {
      throw new BadRequestException('Cart item not found or unauthorized.');
    }

    await this.prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });

    return this.getCart(targetUserId, merchantId);
  }

  async removeCartItem(userId: string, merchantId: string, cartItemId: string) {
    const targetUserId = userId || 'anonymous-guest-user';

    const cartItem = await this.prisma.cartItem.findFirst({
      where: {
        id: cartItemId,
        cart: { userId: targetUserId, merchantId }
      }
    });

    if (!cartItem) {
      throw new BadRequestException('Cart item not found or unauthorized.');
    }

    await this.prisma.cartItem.delete({
      where: { id: cartItemId }
    });

    return this.getCart(targetUserId, merchantId);
  }
}