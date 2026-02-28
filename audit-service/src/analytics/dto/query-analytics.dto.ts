import {
  IsOptional,
  IsString,
  IsIn,
  IsDateString,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class QueryAnalyticsDto {
  @IsIn(['hourly', 'daily'])
  @IsOptional()
  period?: string = 'daily';

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsString()
  @IsOptional()
  channel?: string;

  @IsString()
  @IsOptional()
  eventType?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  pageSize?: number = 50;
}
