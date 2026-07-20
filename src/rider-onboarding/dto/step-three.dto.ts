import {
  IsEnum,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { IsNIN } from '../validators/nin.validator';
export enum IdentityType {
  NIN = 'NIN',
  DRIVERS_LICENSE = 'DRIVERS_LICENSE',
  VOTERS_CARD = 'VOTERS_CARD',
  INTERNATIONAL_PASSPORT = 'INTERNATIONAL_PASSPORT',
}

export class CreateStep3Dto {
  @IsEnum(IdentityType)
  idType!: IdentityType;

  @IsString()
  @IsNIN()
  @IsNotEmpty()
  idNumber!: string;

  /**
   * Uploaded file URLs returned
   * from Cloudinary/S3 after upload.
   */
  @IsString()
  @IsNotEmpty()
  idFrontUrl!: string;

  @IsString()
  @IsNotEmpty()
  idBackUrl!: string;

  @IsString()
  @IsNotEmpty()
  selfieUrl!: string;
}