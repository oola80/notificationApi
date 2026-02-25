import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  MaxLength,
} from 'class-validator';

export class CreateOverrideDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  eventType: string;

  @IsString()
  @IsIn(['email', 'sms', 'whatsapp', 'push'])
  channel: string;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  createdBy?: string;
}
