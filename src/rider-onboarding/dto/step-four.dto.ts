import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { VehicleType } from  '@prisma/client';



export class CreateStep4Dto {
  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @IsString()
  @IsNotEmpty()
  plateNumber!: string;

  @IsString()
  @IsNotEmpty()
  vehicleBrand!: string;

  @IsString()
  @IsNotEmpty()
  vehicleModel!: string;

  @IsString()
  @IsNotEmpty()
  vehicleColor!: string;

  @IsInt()
  @Min(1980)
  @Max(new Date().getFullYear() + 1)
  vehicleYear!: number;

  @IsOptional()
  @IsString()
  vehiclePhotoUrl?: string;
}