import { Injectable } from '@nestjs/common';
import { PricingEngineService } from './pricing-engine.service';
import { PricingCalculationDto } from './dto/pricing-calculation.dto';

@Injectable()
export class PricingService {
  constructor(
    private readonly pricingEngine: PricingEngineService,
  ) {}

  calculate(dto: PricingCalculationDto) {
    return this.pricingEngine.calculateDeliveryFee(dto);
  }
}