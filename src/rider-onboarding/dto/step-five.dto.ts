import {
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateStep5Dto {
  @IsOptional()
  @IsString()
  profilePhotoUrl?: string;

  @IsOptional()
  @IsString()
  driversLicenseUrl?: string;

  @IsOptional()
  @IsString()
  vehiclePaperUrl?: string;

  @IsOptional()
  @IsString()
  insuranceUrl?: string;

  @IsOptional()
  @IsString()
  roadWorthinessUrl?: string;
}