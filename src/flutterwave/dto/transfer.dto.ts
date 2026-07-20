import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class TransferDto {
  @IsString()
  riderId!: string;

  @IsString()
  accountBank!: string;

  @IsString()
  accountNumber!: string;

  @IsString()
  accountName!: string;


   @IsString()
  bankName!: string;

  @IsNumber()
  @Min(100)
  amount!: number;

  @IsOptional()
  @IsString()
  narration?: string;

    @IsString()
  callbackUrl!: string;
}