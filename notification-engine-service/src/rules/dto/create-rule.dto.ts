import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  IsObject,
  IsIn,
  IsInt,
  IsBoolean,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RuleActionDto } from './rule-action.dto.js';

export class CreateRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  eventType: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  actions: RuleActionDto[];

  @IsObject()
  @IsOptional()
  conditions?: Record<string, any>;

  @IsObject()
  @IsOptional()
  suppression?: Record<string, any>;

  @IsIn(['normal', 'critical'])
  @IsOptional()
  deliveryPriority?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  priority?: number;

  @IsBoolean()
  @IsOptional()
  isExclusive?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  createdBy?: string;
}
