import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayNotEmpty,
  IsIn,
  IsOptional,
  IsObject,
  ValidateNested,
  IsEmail,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ManualSendRecipientDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsString()
  @IsOptional()
  deviceToken?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  name?: string;
}

export class ManualSendDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  templateId: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(['email', 'sms', 'whatsapp', 'push'], { each: true })
  channels: string[];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ManualSendRecipientDto)
  recipients: ManualSendRecipientDto[];

  @IsString()
  @IsOptional()
  @IsIn(['normal', 'critical'])
  priority?: string;

  @IsObject()
  @IsOptional()
  data?: Record<string, any>;
}
