import {
  IsNumber,
  Min,
} from 'class-validator';

export class WithdrawWalletDto {
  @IsNumber()
  @Min(100)
  amount!: number;
}