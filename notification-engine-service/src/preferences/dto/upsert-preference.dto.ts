import {
  IsString,
  IsNotEmpty,
  IsBoolean,
  IsOptional,
  IsIn,
  MaxLength,
} from 'class-validator';

export class UpsertPreferenceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  customerId: string;

  @IsString()
  @IsIn(['email', 'sms', 'whatsapp', 'push'])
  channel: string;

  @IsBoolean()
  isOptedIn: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  sourceSystem?: string;
}
