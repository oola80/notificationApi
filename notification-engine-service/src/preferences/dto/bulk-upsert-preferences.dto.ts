import {
  IsArray,
  ArrayNotEmpty,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UpsertPreferenceDto } from './upsert-preference.dto.js';

export class BulkUpsertPreferencesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => UpsertPreferenceDto)
  preferences: UpsertPreferenceDto[];
}
