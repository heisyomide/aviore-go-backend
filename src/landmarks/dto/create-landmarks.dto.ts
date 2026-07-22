import { IsArray, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateLandmarkDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  aliases?: string[];

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  city!: string;

  @IsString()
  @IsNotEmpty()
  state!: string;

  @IsLatitude()
  latitude!: number;

  @IsLongitude()
  longitude!: number;
}