import { IsInt, Min, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class RollbackTemplateDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  versionNumber: number;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  updatedBy?: string;
}
