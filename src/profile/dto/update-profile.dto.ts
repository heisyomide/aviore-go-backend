import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsPhoneNumber,
} from "class-validator";

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsPhoneNumber("NG")
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}