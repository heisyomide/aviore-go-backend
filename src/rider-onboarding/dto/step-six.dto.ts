import {
  IsNotEmpty,
  IsString,
  Length,
} from 'class-validator';

export class CreateStep6Dto {
  @IsString()
  @IsNotEmpty()
  bankName!: string;

  @IsString()
bankCode!: string;

  @IsString()
  @Length(10, 10)
  accountNumber!: string;

  @IsString()
  @IsNotEmpty()
  accountName!: string;
}