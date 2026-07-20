import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';
import { IsAdult } from '../validators/age.validator';

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
}

export class CreateStep2Dto {
  @IsDateString()
  @IsAdult()
  dateOfBirth!: string;

  @IsEnum(Gender)
  gender!: Gender;

  @IsString()
  @IsNotEmpty()
  residentialAddress!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  localGovernment!: string;

  @IsString()
  @IsNotEmpty()
  nextOfKinName!: string;

  @IsString()
  @Matches(/^[0-9]{11}$/)
  nextOfKinPhone!: string;

  @IsString()
  @IsNotEmpty()
  relationship!: string;

   @IsString()
  @IsNotEmpty()
  emergencyContactName!: string;

   @IsString()
  @Matches(/^[0-9]{11}$/)
  emergencyContactPhone!: string;

   @IsString()
  @IsNotEmpty()
  emergencyRelationship!: string;
}