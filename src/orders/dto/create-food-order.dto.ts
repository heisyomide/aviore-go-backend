import { IsString, IsNumber, IsArray, ValidateNested, IsOptional, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

class FoodOrderItemDto {
  @IsString()
  @IsNotEmpty()
  menuItemId!: string;

  @IsNumber()
  quantity!: number;

  @IsNumber()
  price!: number;
}

export class CreateFoodOrderDto {
  @IsString()
  @IsNotEmpty()
  merchantId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FoodOrderItemDto)
  items!: FoodOrderItemDto[];

  // Delivery & Location data required for the downstream shipment calculation
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