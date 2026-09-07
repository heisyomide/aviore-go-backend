import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class UpdateDeliveryAddressDto {
  @IsString()
  @IsNotEmpty()
  landmarkId!: string; // Accepts string IDs/slugs safely

  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  streetAddress!: string; // e.g. "Plot 12, Block 4"
}