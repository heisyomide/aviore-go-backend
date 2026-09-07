import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsArray,
} from 'class-validator';

export class InitializePaymentDto {
  @IsOptional()
  @IsString()
  shipmentId?: string;

  @IsOptional()
  @IsString()
  bookingId?: string;

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsString()
  routeId?: string;

  @IsOptional()
  @IsString()
  pickupPointId?: string;

  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsString()
  tripType?: string;

  @IsOptional()
  @IsBoolean()
  cartCheckout?: boolean;

  @IsOptional()
  @IsString()
  cartId?: string;

  @IsOptional()
  @IsArray()
  items?: any[]; // <--- Added to prevent validation rejection

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsNumber()
  @Min(100, { message: 'amount must not be less than 100' })
  amount?: number;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  redirectUrl?: string;

  @IsOptional()
  @IsString()
  name?: string;
}