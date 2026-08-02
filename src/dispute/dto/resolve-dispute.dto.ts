import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { DisputeStatus, ResolutionOutcome } from '@prisma/client';

export class ResolveDisputeDto {
  @IsEnum(DisputeStatus)
  status!: DisputeStatus; // RESOLVED or REJECTED

  @IsOptional()
  @IsEnum(ResolutionOutcome)
  resolution?: ResolutionOutcome;

  @IsString()
  @IsNotEmpty()
  adminNotes!: string;
}