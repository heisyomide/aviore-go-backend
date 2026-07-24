// dto/admin-broadcast.dto.ts
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum BroadcastChannel {
  PUSH = 'PUSH',
  EMAIL_BREVO = 'EMAIL_BREVO',
}

export class AdminBroadcastDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsArray()
  @IsEnum(BroadcastChannel, { each: true })
  channels!: BroadcastChannel[];

  @IsArray()
  @IsOptional()
  recipientEmails?: string[];

  @IsArray()
  @IsOptional()
  recipientUserIds?: string[];
}