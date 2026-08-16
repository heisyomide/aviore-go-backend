import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  ArrayMinSize,
} from 'class-validator';
import { UserRole, ChannelType } from '@prisma/client';

export class AdminBroadcastDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  // Optional: If omitted, broadcasts globally. 
  // Supports UserRole.ORGANIZER, UserRole.RIDER, UserRole.CUSTOMER, etc.
  @IsOptional()
  @IsEnum(UserRole)
  targetAudience?: UserRole;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ChannelType, { each: true })
  channels!: ChannelType[];
}