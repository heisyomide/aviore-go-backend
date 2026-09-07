import { Injectable } from '@nestjs/common';
import { PricingEngineService } from './pricing-engine.service';
import { FoodPricingService } from './food-pricing.service';
import { PricingCalculationDto } from './dto/pricing-calculation.dto';
import { FoodPricingCalculationDto } from './dto/food-pricing-calculation.dto';

@Injectable()
export class PricingService {
  constructor(
    private readonly pricingEngine: PricingEngineService,
    private readonly foodPricingEngine: FoodPricingService,
  ) {}

  calculate(dto: PricingCalculationDto) {
    return this.pricingEngine.calculateDeliveryFee(dto);
  }

  calculateFood(dto: FoodPricingCalculationDto) {
    return this.foodPricingEngine.calculateFoodOrderPricing(dto);
  }
}