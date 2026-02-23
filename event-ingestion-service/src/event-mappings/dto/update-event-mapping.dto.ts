import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { CreateEventMappingDto } from './create-event-mapping.dto.js';

export class UpdateEventMappingDto extends PartialType(
  OmitType(CreateEventMappingDto, ['sourceId', 'eventType', 'createdBy']),
) {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  updatedBy?: string;
}
