import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateAddressDto {
  @IsString()
  @IsNotEmpty()
  landmarkId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  streetAddress!: string;
}