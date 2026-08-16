import { IsString, IsNotEmpty, IsDateString, IsOptional, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePickupPointDto {
  @IsString()
  @IsNotEmpty()
  name!: string; // e.g., "Ikeja City Mall"

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsOptional()
  landmark?: string;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  maxCapacity?: number;
}

export class CreateRouteDto {
  @IsString()
  @IsNotEmpty()
  originCity!: string; // e.g., "Lagos"

  @IsString()
  @IsNotEmpty()
  destination!: string; // e.g., "Ibadan"


  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePickupPointDto)
  pickupPoints!: CreatePickupPointDto[];
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsString()
  @IsNotEmpty()
  venue!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRouteDto)
  routes!: CreateRouteDto[];
}