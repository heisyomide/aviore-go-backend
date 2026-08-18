import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CheckInDto {
  @IsString()
  @IsNotEmpty()
  qrToken!: string;

  @IsString()
  @IsOptional()
  tripId?: string;
}