import { IsString, IsNotEmpty, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { TripLeg } from '@prisma/client';

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
}