import { Injectable } from '@nestjs/common';
import { PackageCategory, RegionType, WeightRange } from '@prisma/client';
import { PricingCalculationDto } from './dto/pricing-calculation.dto';

@Injectable()
export class PricingEngineService {

  private readonly BASE_FARES = {
    [RegionType.INTRA_CITY]: 500,
    [RegionType.INTRA_STATE]: 1500,
    [RegionType.INTERSTATE]: 4000,
  };

  private readonly CATEGORY_MULTIPLIERS: Record<PackageCategory, number> = {
    
    SMALL_PARCEL: 1.1,
    MEDIUM_PARCEL: 1.3,
    LARGE_PARCEL: 1.6,
    FRAGILE_ITEM: 1.5,
    CLOTHING: 1.1,
    ELECTRONICS: 1.4,
  };

  private readonly WEIGHT_SURCHARGES: Record<WeightRange, number> = {
    UNDER_1KG: 0,
    FROM_1_3KG: 200,
    FROM_3_5KG: 400,
    FROM_5_10KG: 700,
    FROM_10_20KG: 1200,
    ABOVE_20KG: 2500,
  };

  calculateDeliveryFee(dto: PricingCalculationDto) {
    const distanceKm = this.calculateHaversineDistance(
      dto.pickupLat,
      dto.pickupLng,
      dto.destinationLat,
      dto.destinationLng,
    );

    let region: RegionType = RegionType.INTRA_CITY;

    if (distanceKm > 15 && distanceKm <= 60) {
      region = RegionType.INTRA_STATE;
    }

    if (distanceKm > 60) {
      region = RegionType.INTERSTATE;
    }

    const baseFee = this.BASE_FARES[region];

    const estimatedRiderToPickupKm = 3.5;

    const pickupDistanceFee = estimatedRiderToPickupKm * 80;

    const perKmRate =
      region === RegionType.INTERSTATE ? 180 : 120;

    const deliveryDistanceFee = distanceKm * perKmRate;

    const categoryMultiplier =
      this.CATEGORY_MULTIPLIERS[dto.packageCategory];

    const weightSurcharge =
      this.WEIGHT_SURCHARGES[dto.weightRange];

    let extraCharges = weightSurcharge;

    if (dto.isExpress) {
      extraCharges += 500;
    }

    if (dto.waterproof) {
      extraCharges += 200;
    }

    const subTotal =
      baseFee +
      pickupDistanceFee +
      deliveryDistanceFee;

    const multipliedTotal =
      subTotal * categoryMultiplier;

    const finalTotalFee = Math.round(
      multipliedTotal + extraCharges,
    );

    const estimatedTimeMinutes = Math.max(
      12,
      Math.round((distanceKm / 45) * 60) + 5,
    );

    return {
      distanceKm: Number(distanceKm.toFixed(1)),
      estimatedMinutes: estimatedTimeMinutes,

      breakdown: {
        baseFee,
        pickupDistanceFee,
        deliveryDistanceFee,
        extraCharges,
      },

      totalDeliveryFee: finalTotalFee,

      detectedRegion: region,
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
      Math.sin(dLat / 2) *
        Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c =
      2 *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a),
      );

    return R * c;
  }
}

export { PricingCalculationDto };
