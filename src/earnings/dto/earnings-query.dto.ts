import {
  IsIn,
  IsOptional,
} from 'class-validator';

export class EarningsQueryDto {
  @IsOptional()
  @IsIn([
    'today',
    'week',
    'month',
    'year',
  ])
  period?: 'today' | 'week' | 'month' | 'year' = 'week';
}