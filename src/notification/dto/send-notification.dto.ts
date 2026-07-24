// dto/send-notification.dto.ts
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsObject } from 'class-validator';

export enum NotificationType {
  ACCOUNT_WELCOME = 'ACCOUNT_WELCOME',
  PASSWORD_RESET_OTP = 'PASSWORD_RESET_OTP',
  ESCROW_VERIFICATION_PIN = 'ESCROW_VERIFICATION_PIN',
  PAYMENT_RECEIPT = 'PAYMENT_RECEIPT',
  LOGIN_ALERT = 'LOGIN_ALERT',
  LOGOUT_ALERT = 'LOGOUT_ALERT',
  WITHDRAWAL_UPDATE = 'WITHDRAWAL_UPDATE', // 👈 Added
  SYSTEM_ALERT = 'SYSTEM_ALERT',
  RIDER_ASSIGNED = 'RIDER_ASSIGNED',
  ORDER_STATUS_UPDATE = 'ORDER_STATUS_UPDATE',
  MARKETING_PROMO = 'MARKETING_PROMO',
  SYSTEM_ANNOUNCEMENT = 'SYSTEM_ANNOUNCEMENT',
}

export class SendNotificationDto {
  @IsEnum(NotificationType)
  @IsNotEmpty()
  type!: NotificationType;

  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;
}