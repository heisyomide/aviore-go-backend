import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { PricingEngineService, PricingCalculationDto } from './pricing-engine.service';

@Controller('pricing')
export class PricingController {
  constructor(
    private readonly pricingEngineService: PricingEngineService,
  ) {}

  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  calculatePrice(
    @Body() dto: PricingCalculationDto,
  ) {
    return this.pricingEngineService.calculateDeliveryFee(dto);
  }
}