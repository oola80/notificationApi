import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  WHATSAPP_PORT?: number;

  @IsString()
  @IsOptional()
  META_ACCESS_TOKEN?: string;

  @IsString()
  @IsOptional()
  META_PHONE_NUMBER_ID?: string;

  @IsString()
  @IsOptional()
  META_APP_SECRET?: string;

  @IsString()
  @IsOptional()
  META_WEBHOOK_VERIFY_TOKEN?: string;

  @IsString()
  @IsOptional()
  META_API_VERSION?: string;

  @IsString()
  @IsOptional()
  META_DEFAULT_TEMPLATE_LANGUAGE?: string;

  @IsBoolean()
  @IsOptional()
  WHATSAPP_TEST_MODE?: boolean = false;

  @IsString()
  @IsOptional()
  WHATSAPP_TLS_REJECT_UNAUTHORIZED?: string = 'true';

  @IsString()
  @IsOptional()
  RABBITMQ_HOST?: string;

  @IsNumber()
  @IsOptional()
  RABBITMQ_PORT?: number;

  @IsString()
  @IsOptional()
  RABBITMQ_VHOST?: string;

  @IsString()
  @IsOptional()
  RABBITMQ_USER?: string;

  @IsString()
  @IsOptional()
  RABBITMQ_PASSWORD?: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });
  if (errors.length > 0) throw new Error(errors.toString());
  return validatedConfig;
}
