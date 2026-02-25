import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayNotEmpty,
  IsIn,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';

export class RuleActionDto {
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  @IsIn(['email', 'sms', 'whatsapp', 'push'], { each: true })
  channels: string[];

  @IsString()
  @IsIn(['customer', 'group', 'custom'])
  recipientType: string;

  @IsString()
  @IsOptional()
  recipientGroupId?: string;

  @IsArray()
  @IsOptional()
  customRecipients?: Record<string, any>[];

  @IsInt()
  @Min(0)
  @IsOptional()
  delayMinutes?: number;
}
