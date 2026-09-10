import { IsString, IsNumber, IsOptional, IsBoolean, Min, IsUUID, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
export enum SelectionTypeDto {
  REQUIRED = 'REQUIRED',
  OPTIONAL = 'OPTIONAL',
}

export class CustomizationOptionDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class CustomizationGroupDto {
  @IsString()
  name!: string; // e.g. "Soup", "Protein"

  @IsEnum(SelectionTypeDto)
  selectionType!: SelectionTypeDto;

  @IsNumber()
  @Min(0)
  minSelections!: number;

  @IsNumber()
  @Min(1)
  maxSelections!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomizationOptionDto)
  options!: CustomizationOptionDto[];
}

export class CreateMenuItemDto {
  @IsString()
  name!: string;

  @IsNumber()
  @Min(0)
  price!: number; // Base price or unit/portion price

  @IsUUID()
  subcategoryId!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  prepTime?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CustomizationGroupDto)
  customizationGroups?: CustomizationGroupDto[];
}
export class UpdateMenuItemDto extends PartialType(CreateMenuItemDto) {}