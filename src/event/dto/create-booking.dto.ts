import { IsString, IsNotEmpty, IsNumber } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  routeId!: string;

  @IsString()
  @IsNotEmpty()
  pickupPointId!: string;

  @IsString()
  @IsNotEmpty()
  tripId!: string;

  @IsNumber()
  amountPaid!: number;
}