import { IsString, IsNotEmpty, IsDateString, IsEnum, IsOptional, IsNumber, ValidateNested, IsArray } from 'class-validator';
import { TripLeg } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateTripDto {
  @IsString()
  @IsNotEmpty()
  routeId!: string;

  @IsString()
  @IsOptional()
  vehicleId?: string;

  @IsString()
  @IsOptional()
  driverId?: string; // Links to RiderProfile id

  @IsEnum(TripLeg)
  tripLeg!: TripLeg; // OUTBOUND or RETURN

  @IsDateString()
  departureTime!: string;

  @IsDateString()
  @IsOptional()
  arrivalTime?: string;

  @IsNumber()
  @IsNotEmpty()
  customerOneWayFare!: number;

  @IsNumber()
  @IsNotEmpty()
  customerRoundTripFare!: number;

  @IsNumber()
  @IsNotEmpty()
  driverPayout!: number;
}

class PickupCoordDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsNumber()
  latitude?: number | null;

  @IsOptional()
  @IsNumber()
  longitude?: number | null;
}

export class UpdateRouteCoordinatesDto {
  @IsOptional()
  @IsNumber()
  destinationLat?: number | null;

  @IsOptional()
  @IsNumber()
  destinationLng?: number | null;

  @IsOptional()
  @IsNumber()
  customerOneWayFare?: number | null;

  @IsOptional()
  @IsNumber()
  customerRoundTripFare?: number | null;

  @IsOptional()
  @IsNumber()
  driverPayout?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PickupCoordDto)
  pickupPoints?: PickupCoordDto[];
}