import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsIn,
} from 'class-validator';

export class ListDlqQueryDto {
  @IsIn(['pending', 'investigated', 'reprocessed', 'discarded'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  originalQueue?: string;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

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
