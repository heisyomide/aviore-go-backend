import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { DisputeRole } from '@prisma/client';

export class CreateDisputeDto {
  @IsString()
  @IsNotEmpty()
  jobId!: string;

  @IsEnum(DisputeRole)
  reportedByRole!: DisputeRole;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;
}