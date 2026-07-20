import { IsBoolean, IsEnum, IsNumber } from 'class-validator';
import { PackageCategory, WeightRange } from '@prisma/client';

export class PricingCalculationDto {
  @IsNumber()
  pickupLat!: number;

  @IsNumber()
  pickupLng!: number;

  @IsNumber()
  destinationLat!: number;

  @IsNumber()
  destinationLng!: number;

  @IsEnum(PackageCategory)
  packageCategory!: PackageCategory;

  @IsEnum(WeightRange)
  weightRange!: WeightRange;

  @IsBoolean()
  isExpress!: boolean;

  @IsBoolean()
  waterproof!: boolean;
}