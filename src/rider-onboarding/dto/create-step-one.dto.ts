import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  Matches,
  IsStrongPassword,
} from 'class-validator';
import { MatchPassword } from '../validators/password-strength.validator';

export class CreateStep1Dto {
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @IsOptional()
  @IsString()
  middleName?: string;

  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @IsString()
  @Matches(/^[0-9]{11}$/)
  phoneNumber!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsStrongPassword()
  @MinLength(8)
  password!: string;

  @IsString()
  @MatchPassword('password')
  @MinLength(8)
  confirmPassword!: string;

  @IsOptional()
  @IsString()
  referralCode?: string;
}