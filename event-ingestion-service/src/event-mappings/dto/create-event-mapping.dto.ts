import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsIn,
  MaxLength,
} from 'class-validator';

export class CreateEventMappingDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  sourceId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  eventType: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsNotEmpty()
  fieldMappings: Record<string, any>;

  @IsObject()
  @IsOptional()
  eventTypeMapping?: Record<string, any>;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  timestampField?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  timestampFormat?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  sourceEventIdField?: string;

  @IsObject()
  @IsOptional()
  validationSchema?: Record<string, any>;

  @IsIn(['normal', 'critical'])
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  createdBy?: string;
}
