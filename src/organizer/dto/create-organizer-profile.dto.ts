import { IsOptional, IsString, IsEmail } from 'class-validator';

export class CreateOrganizerProfileDto {
  @IsString()
  organizationName!: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  instagramHandle?: string;

  @IsEmail()
  @IsOptional()
  supportEmail?: string;

  @IsString()
  supportPhone!: string;

  @IsString()
  logoUrl!: string; // Will receive the uploaded file URL from your storage/upload service
}