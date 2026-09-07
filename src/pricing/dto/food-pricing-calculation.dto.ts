// src/pricing/dto/food-pricing-calculation.dto.ts
import { IsNumber, Min } from 'class-validator';

export class FoodPricingCalculationDto {
  @IsNumber()
  pickupLat!: number;

  @IsNumber()
  pickupLng!: number;

  @IsNumber()
  destinationLat!: number;

  @IsNumber()
  destinationLng!: number;

  @IsNumber()
  @Min(0)
  foodSubtotal!: number;
}