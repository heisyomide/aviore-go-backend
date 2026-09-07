// src/pricing/food-pricing.service.ts
import { Injectable } from '@nestjs/common';
import { FoodPricingCalculationDto } from './dto/food-pricing-calculation.dto';

@Injectable()
export class FoodPricingService {
  private readonly BASE_FEE = 500;
  private readonly PER_KM_RATE = 100;
  private readonly MERCHANT_SHARE_RATE = 0.90; // 90%
  private readonly MERCHANT_COMMISSION_RATE = 0.10; // 10%
  private readonly RIDER_SHARE_RATE = 0.80; // 80%
  private readonly PLATFORM_DELIVERY_SHARE_RATE = 0.20; // 20%

  calculateFoodOrderPricing(dto: FoodPricingCalculationDto) {
    const distanceKm = this.calculateHaversineDistance(
      dto.pickupLat,
      dto.pickupLng,
      dto.destinationLat,
      dto.destinationLng,
    );

    const deliveryFee = Math.round(this.BASE_FEE + distanceKm * this.PER_KM_RATE);
    const subtotal = dto.foodSubtotal;

    // 1. Food Subtotal Split (90% Merchant / 10% Platform)
    const merchantShare = Math.round(subtotal * this.MERCHANT_SHARE_RATE);
    const foodPlatformShare = Math.round(subtotal * this.MERCHANT_COMMISSION_RATE);

    // 2. Delivery Fee Split (80% Rider / 20% Platform)
    const riderShare = Math.round(deliveryFee * this.RIDER_SHARE_RATE);
    const deliveryPlatformShare = Math.round(deliveryFee * this.PLATFORM_DELIVERY_SHARE_RATE);

    // 3. Totals
    const totalPayable = subtotal + deliveryFee;
    const totalPlatformRevenue = foodPlatformShare + deliveryPlatformShare;

    const estimatedMinutes = Math.max(
      15,
      Math.round((distanceKm / 35) * 60) + 10,
    );

    return {
      distanceKm: Number(distanceKm.toFixed(1)),
      estimatedMinutes,
      subtotal,
      deliveryFee,
      totalPayable,
      breakdown: {
        baseFee: this.BASE_FEE,
        deliveryDistanceFee: Math.round(distanceKm * this.PER_KM_RATE),
      },
      splits: {
        merchantShare,
        foodPlatformShare,
        riderShare,
        deliveryPlatformShare,
        totalPlatformRevenue,
      },
    };
  }

  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}