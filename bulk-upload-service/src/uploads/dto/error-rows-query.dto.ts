import { IsOptional, IsInt, Min, Max } from 'class-validator';

export class ErrorRowsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
