import { IsString, IsNotEmpty } from 'class-validator';

export class CompleteDeliveryDto {
  @IsString()
  @IsNotEmpty()
  verificationPin!: string;
}