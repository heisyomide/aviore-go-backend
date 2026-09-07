import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../providers/database/prisma.service';
import { FoodPricingService } from '../pricing/food-pricing.service';

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly foodPricingService: FoodPricingService,
  ) {}

  async getCart(userId: string, userLat?: number, userLng?: number) {
    if (!userId) {
      return { 
        items: [], 
        subtotal: 0, 
        deliveryFee: 0, 
        total: 0, 
        distanceKm: 0, 
        estimatedMinutes: 0, 
        breakdown: { baseFee: 500, deliveryDistanceFee: 0 } 
      };
    }

    let cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { foodItem: { include: { merchant: true } } }
        }
      }
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId },
        include: { items: { include: { foodItem: { include: { merchant: true } } } } }
      });
    }

    const subtotal = cart.items.reduce(
      (acc, item) => acc + Number(item.foodItem?.price || 0) * item.quantity,
      0
    );

    let deliveryFee = 0;
    let distanceKm = 0;
    let estimatedMinutes = 0;
    let breakdown = { baseFee: 500, deliveryDistanceFee: 0 };

    if (cart.items.length > 0 && cart.items[0].foodItem?.merchant) {
      const merchant = cart.items[0].foodItem.merchant;
      
      if (
        merchant.latitude != null &&
        merchant.longitude != null &&
        userLat != null &&
        userLng != null
      ) {
        const pricing = this.foodPricingService.calculateFoodOrderPricing({
          pickupLat: Number(merchant.latitude),
          pickupLng: Number(merchant.longitude),
          destinationLat: Number(userLat),
          destinationLng: Number(userLng),
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
    }

    return {
      ...cart,
      subtotal,
      deliveryFee,
      distanceKm,
      estimatedMinutes,
      breakdown,
      total: subtotal + (subtotal > 0 ? deliveryFee : 0),
    };
  }

  async addItemToCart(userId: string, foodItemId: string, quantity: number = 1, userLat?: number, userLng?: number) {
    const cart = await this.prisma.cart.upsert({
      where: { userId },
      update: {},
      create: { userId },
    });

    const existingItem = await this.prisma.cartItem.findFirst({
      where: { cartId: cart.id, foodItemId }
    });

    if (existingItem) {
      await this.prisma.cartItem.update({
        where: { id: existingItem.id },
        data: { quantity: existingItem.quantity + quantity }
      });
    } else {
      await this.prisma.cartItem.create({
        data: { cartId: cart.id, foodItemId, quantity }
      });
    }

    return this.getCart(userId, userLat, userLng);
  }

  async updateQuantity(userId: string, cartItemId: string, quantity: number, userLat?: number, userLng?: number) {
    if (quantity < 1) {
      return this.removeCartItem(userId, cartItemId, userLat, userLng);
    }

    await this.prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });

    return this.getCart(userId, userLat, userLng);
  }

  async removeCartItem(userId: string, cartItemId: string, userLat?: number, userLng?: number) {
    await this.prisma.cartItem.delete({
      where: { id: cartItemId }
    });
    return this.getCart(userId, userLat, userLng);
  }
}