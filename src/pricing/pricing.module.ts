import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingEngineService } from './pricing-engine.service';
import { PricingService } from './pricing.service';
import { FoodPricingService } from './food-pricing.service';

@Module({
  controllers: [PricingController],
  providers: [PricingEngineService, PricingService, FoodPricingService],
  exports: [PricingEngineService, PricingService, FoodPricingService], // <--- Add FoodPricingService here
})
export class PricingModule {}