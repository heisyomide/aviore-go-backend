import { IsString, IsNotEmpty, IsNumber, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { DeliveryType, PackageCategory, WeightRange , DeliverySpeed } from '@prisma/client';

export class CreateShipmentDto {
  @IsEnum(DeliveryType)
  @IsNotEmpty()
  deliveryType!: DeliveryType;

  @IsEnum(PackageCategory)
  @IsNotEmpty()
  packageCategory!: PackageCategory;

  @IsEnum(DeliverySpeed)
deliverySpeed!: DeliverySpeed;

  @IsEnum(WeightRange)
  @IsNotEmpty()
  weightRange!: WeightRange;

  @IsString()
  @IsOptional()
  description?: string;

  // Step 2: Pickup Metadata
  @IsString()
  @IsNotEmpty()
  pickupAddress!: string;

  @IsNumber()
  @IsNotEmpty()
  pickupLat!: number;

  @IsNumber()
  @IsNotEmpty()
  pickupLng!: number;

  @IsString()
  @IsNotEmpty()
  pickupPlaceId!: string;

  // Step 3: Destination Metadata
  @IsString()
  @IsNotEmpty()
  destinationAddress!: string;

  @IsNumber()
  @IsNotEmpty()
  destinationLat!: number;

  @IsNumber()
  @IsNotEmpty()
  destinationLng!: number;

  @IsString()
  @IsNotEmpty()
  destinationPlaceId!: string;

  // Step 7: Special Handling Flags
  @IsBoolean()
  @IsOptional()
  isFragile?: boolean;

  @IsBoolean()
  @IsOptional()
  keepUpright?: boolean;

  @IsBoolean()
  @IsOptional()
  handleWithCare?: boolean;

  @IsBoolean()
  @IsOptional()
  waterproof?: boolean;

  @IsBoolean()
  @IsOptional()
  isExpress?: boolean;

  // Core Manifest Recipients
  @IsString()
  @IsNotEmpty()
  receiverName!: string;

  @IsString()
  @IsNotEmpty()
  receiverPhone!: string;

  @IsString()
  @IsNotEmpty()
  deliveryMethod!: 'standard' | 'smart';

  @IsString()
  @IsOptional()
  deliveryNote?: string;

  @IsString()
  @IsNotEmpty()
  verificationPin!: string;
}