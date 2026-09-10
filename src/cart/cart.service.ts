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

    let cart = await this.prisma.cart.findUnique({
      where: { userId_merchantId: { userId: targetUserId, merchantId } },
      include: {
        items: {
          include: { foodItem: { include: { merchant: true } } }
        }
      }
    });

    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { userId: targetUserId, merchantId },
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
      subtotal,
      deliveryFee,
      distanceKm,
      estimatedMinutes,
      breakdown,
      total: subtotal + (subtotal > 0 ? deliveryFee : 0),
    };
  }

  async addItemToCart(userId: string, merchantId: string, foodItemId: string, quantity: number = 1) {
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

    return this.getCart(targetUserId, merchantId);
  }

  async updateQuantity(userId: string, merchantId: string, cartItemId: string, quantity: number) {
    if (quantity < 1) {
      return this.removeCartItem(userId, merchantId, cartItemId);
    }

    await this.prisma.cartItem.update({
      where: { id: cartItemId },
      data: { quantity },
    });

    return this.getCart(userId, merchantId);
  }

  async removeCartItem(userId: string, merchantId: string, cartItemId: string) {
    await this.prisma.cartItem.delete({
      where: { id: cartItemId }
    });
    return this.getCart(userId, merchantId);
  }
}