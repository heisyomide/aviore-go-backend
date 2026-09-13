import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, IsNotEmpty, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderCustomizationSelectionDto {
  @IsString()
  @IsNotEmpty()
  optionId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;
}

export class FoodOrderItemDto {
  @IsString()
  @IsOptional()
  foodItemId?: string;

  @IsString()
  @IsOptional()
  menuItemId?: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => OrderCustomizationSelectionDto)
  customizationOptions?: OrderCustomizationSelectionDto[];

  @IsOptional()
  selectedAddOns?: any;
}

export class CreateFoodOrderDto {
  @IsString()
  @IsNotEmpty()
  merchantId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FoodOrderItemDto)
  items!: FoodOrderItemDto[];

  @IsString()
  @IsNotEmpty()
  deliveryAddress!: string;

  @IsNumber()
  destinationLat!: number;

  @IsNumber()
  destinationLng!: number;

  @IsString()
  @IsOptional()
  deliveryNote?: string;
}