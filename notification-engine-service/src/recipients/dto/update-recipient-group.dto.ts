import {
  IsString,
  IsOptional,
  IsArray,
  IsInt,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RecipientGroupMemberDto } from './recipient-group-member.dto.js';

export class UpdateRecipientGroupDto {
  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => RecipientGroupMemberDto)
  addMembers?: RecipientGroupMemberDto[];

  @IsArray()
  @IsOptional()
  @IsInt({ each: true })
  removeMemberIds?: number[];
}
