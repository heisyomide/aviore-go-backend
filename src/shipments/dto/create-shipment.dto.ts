import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import {
  DeliveryType,
  PackageCategory,
  WeightRange,
  DeliverySpeed,
} from '@prisma/client';

export class CreateShipmentDto {
  // -------------------------------------------------------------
  // STEP 1: SHIPMENT CONFIGURATION
  // -------------------------------------------------------------
  @IsEnum(DeliveryType)
  @IsNotEmpty()
  deliveryType!: DeliveryType;

  @IsEnum(PackageCategory)
  @IsNotEmpty()
  packageCategory!: PackageCategory;

  @IsEnum(DeliverySpeed)
  @IsNotEmpty()
  deliverySpeed!: DeliverySpeed;

  @IsEnum(WeightRange)
  @IsNotEmpty()
  weightRange!: WeightRange;

  @IsString()
  @IsOptional()
  description?: string;

  // -------------------------------------------------------------
  // STEP 2: PICKUP LOCATION & SENDER INFO
  // -------------------------------------------------------------
  @IsString()
  @IsNotEmpty()
  pickupAddress!: string; // Main street address or map pin label

  @IsString()
  @IsOptional()
  pickupLandmark?: string; // e.g. "Opposite Access Bank, Blue Gate"

  @IsNumber()
  @IsNotEmpty()
  pickupLat!: number;

  @IsNumber()
  @IsNotEmpty()
  pickupLng!: number;

  @IsString()
  @IsOptional()
  pickupPlaceId?: string; // Optional for OSM/Nominatim or dropped pins

  @IsString()
  @IsNotEmpty()
  senderName!: string;

  @IsString()
  @IsNotEmpty()
  senderPhone!: string;

  // -------------------------------------------------------------
  // STEP 3: DESTINATION & RECIPIENT INFO
  // -------------------------------------------------------------
  @IsString()
  @IsNotEmpty()
  destinationAddress!: string; // Main house/office address

  @IsString()
  @IsOptional()
  destinationLandmark?: string; // e.g. "Beside GTBank, White Store"

  @IsNumber()
  @IsNotEmpty()
  destinationLat!: number;

  @IsNumber()
  @IsNotEmpty()
  destinationLng!: number;

  @IsString()
  @IsOptional()
  destinationPlaceId?: string; // Optional for OSM/Nominatim or dropped pins

  @IsString()
  @IsNotEmpty()
  receiverName!: string;

  @IsString()
  @IsNotEmpty()
  receiverPhone!: string;

  // -------------------------------------------------------------
  // STEP 4: SPECIAL HANDLING FLAGS
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // STEP 5: DELIVERY METHOD & VERIFICATION
  // -------------------------------------------------------------
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