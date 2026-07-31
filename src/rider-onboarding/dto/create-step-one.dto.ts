import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

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
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'Phone number must be valid digits without spaces or dashes (e.g. +2348012345678 or 08012345678)',
  })
  phoneNumber!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  residentialAddress?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  localGovernment?: string;

  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @IsOptional()
  @IsString()
  emergencyRelationship?: string;

  @IsOptional()
  @IsString()
  referralCode?: string;
}