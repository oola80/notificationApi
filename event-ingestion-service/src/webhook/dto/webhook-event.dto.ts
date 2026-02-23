import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  MaxLength,
} from 'class-validator';

export class WebhookEventDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  sourceId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  cycleId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  eventType: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  sourceEventId?: string;

  @IsString()
  @IsOptional()
  timestamp?: string;

  @IsObject()
  @IsNotEmpty()
  payload: Record<string, any>;
}
