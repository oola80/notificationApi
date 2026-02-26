import { IsObject, IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class PreviewTemplateDto {
  @IsObject()
  @IsNotEmpty()
  data: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  versionNumber?: number;
}
