import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsObject,
  ValidateIf,
} from 'class-validator';

export class ChannelDto {
  @IsIn(['email', 'sms', 'whatsapp', 'push'])
  @IsNotEmpty()
  channel: string;

  @ValidateIf((o) => o.channel === 'email' || o.channel === 'push')
  @IsString()
  @IsNotEmpty()
  subject?: string;

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
