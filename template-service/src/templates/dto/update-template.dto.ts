import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ChannelDto } from './channel.dto.js';

export class UpdateTemplateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @Type(() => ChannelDto)
  channels: ChannelDto[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  changeSummary: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  updatedBy?: string;
}
