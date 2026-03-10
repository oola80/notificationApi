import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsEnum,
  IsDefined,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecipientDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  customerId?: string;
}

export class MediaDto {
  @IsString()
  @IsNotEmpty()
  url: string;

  @IsString()
  @IsNotEmpty()
  contentType: string;

  @IsString()
  @IsOptional()
  filename?: string;

  @IsNumber()
  @IsOptional()
  sizeBytes?: number;
}

export enum ChannelType {
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  PUSH = 'push',
}

export class ContentDto {
  @IsString()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsString()
  @IsOptional()
  htmlBody?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaDto)
  @IsOptional()
  media?: MediaDto[];
}

export class TemplateParameterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  value: string;
}

export class MetadataDto {
  @IsString()
  @IsNotEmpty()
  notificationId: string;

  @IsString()
  @IsOptional()
  correlationId?: string;

  @IsString()
  @IsOptional()
  cycleId?: string;

  @IsString()
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  templateName?: string;

  @IsString()
  @IsOptional()
  templateLanguage?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateParameterDto)
  @IsOptional()
  templateParameters?: TemplateParameterDto[];
}

export class SendRequestDto {
  @IsEnum(ChannelType)
  channel: ChannelType;

  @IsDefined()
  @ValidateNested()
  @Type(() => RecipientDto)
  recipient: RecipientDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => ContentDto)
  content: ContentDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => MetadataDto)
  metadata: MetadataDto;

  @IsString()
  @IsOptional()
  fromAddress?: string;

  @IsString()
  @IsOptional()
  replyTo?: string;
}
