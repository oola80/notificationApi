import { IsOptional, IsIn } from 'class-validator';

export class TriggerAggregationDto {
  @IsIn(['hourly', 'daily'])
  @IsOptional()
  period?: 'hourly' | 'daily';
}
