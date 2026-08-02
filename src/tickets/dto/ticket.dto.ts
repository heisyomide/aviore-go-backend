import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateTicketDto {
  @IsNotEmpty()
  @IsString()
  subject!: string;

  @IsNotEmpty()
  @IsString()
  category!: string; // e.g., 'PAYMENT', 'ACCOUNT', 'DISPUTE', 'GENERAL'

  @IsOptional()
  @IsString()
  jobId?: string;

  @IsNotEmpty()
  @IsString()
  message!: string;
}

export class AddTicketReplyDto {
  @IsNotEmpty()
  @IsString()
  message!: string;
}