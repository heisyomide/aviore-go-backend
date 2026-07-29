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

  // Optional: If omitted/undefined, broadcasts to ALL users globally
  @IsOptional()
  @IsEnum(UserRole)
  targetAudience?: UserRole; // RIDER or CUSTOMER

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ChannelType, { each: true })
  channels!: ChannelType[]; // e.g. [ChannelType.PUSH] or [ChannelType.PUSH, ChannelType.EMAIL]
}