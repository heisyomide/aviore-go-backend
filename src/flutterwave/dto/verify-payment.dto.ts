import { IsString } from 'class-validator';

export class VerifyPaymentDto {
  @IsString()
  txRef!: string;
}