import { IsOptional, IsString } from 'class-validator';

export class GetLandmarksQueryDto {
  @IsOptional()
  @IsString()
  city?: string = 'Osogbo';
}