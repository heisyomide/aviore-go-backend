import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingEngineService } from './pricing-engine.service';
import { PricingService } from './pricing.service';

@Module({
  controllers: [PricingController],
  providers: [PricingEngineService, PricingService],
  exports: [PricingEngineService ,PricingService],
})
export class PricingModule {}