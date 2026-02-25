import { PartialType, OmitType } from '@nestjs/mapped-types';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { CreateRuleDto } from './create-rule.dto.js';

export class UpdateRuleDto extends PartialType(
  OmitType(CreateRuleDto, ['createdBy', 'eventType'] as const),
) {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  updatedBy?: string;
}
