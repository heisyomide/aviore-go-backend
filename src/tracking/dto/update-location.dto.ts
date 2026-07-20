import {
  IsNumber,
  IsString,
} from "class-validator";

export class UpdateLocationDto {
  @IsString()
  shipmentId!: string;

  @IsNumber()
  latitude!: number;

  @IsNumber()
  longitude!: number;

  @IsNumber()
  heading!: number;

  @IsNumber()
  speed!: number;

  @IsNumber()
  accuracy!: number;
}