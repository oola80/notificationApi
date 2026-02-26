import {
  IsIn,
  IsObject,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RenderTemplateDto {
  @IsIn(['email', 'sms', 'whatsapp', 'push'])
  channel: string;

  @IsObject()
  @IsNotEmpty()
  data: Record<string, any>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  versionNumber?: number;
}
