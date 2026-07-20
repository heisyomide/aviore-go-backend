import { IsString, Length } from 'class-validator';

export class CompleteDeliveryDto {
  @IsString()
  @Length(6, 6)
  verificationPin!: string;
}