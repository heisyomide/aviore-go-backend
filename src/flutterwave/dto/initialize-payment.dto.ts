import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class InitializePaymentDto {
  @IsString()
  shipmentId!: string;

  @IsEmail()
  email!: string;

  @IsNumber()
  @Min(100)
  amount!: number;

  @IsString()
  customerName!: string;

    @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  redirectUrl?: string;
}