import {
  IsNotEmpty,
  IsString,
  Length,
} from 'class-validator';

export class UpdateBankDto {
  @IsString()
  @IsNotEmpty()
  bankName!: string;

  @IsString()
  @Length(3, 10)
  bankCode!: string;

  @IsString()
  @Length(10, 10)
  accountNumber!: string;

  @IsString()
  @IsNotEmpty()
  accountName!: string;
}