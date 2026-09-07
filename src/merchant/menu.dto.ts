import { IsString, IsNumber, IsOptional, IsBoolean, Min, IsUUID } from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateMenuItemDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number;

 @IsUUID()
  subcategoryId!: string;

  @IsOptional()
  @IsString()
  prepTime?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  available?: boolean;
}

export class UpdateMenuItemDto extends PartialType(CreateMenuItemDto) {}