import { plainToInstance } from 'class-transformer';
import {
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

  // SES
  @IsNumber()
  @IsOptional()
  ADAPTER_PORT?: number;

  @IsString()
  @IsOptional()
  SES_MODE?: string;

  @IsString()
  @IsOptional()
  SES_REGION?: string;

  @IsString()
  @IsOptional()
  SES_SMTP_USERNAME?: string;

  @IsString()
  @IsOptional()
  SES_SMTP_PASSWORD?: string;

  @IsString()
  @IsOptional()
  SES_FROM_EMAIL?: string;

  @IsString()
  @IsOptional()
  SES_FROM_NAME?: string;

  @IsNumber()
  @IsOptional()
  SES_SMTP_PORT?: number;

  @IsNumber()
  @IsOptional()
  SES_TIMEOUT_MS?: number;

  @IsString()
  @IsOptional()
  SES_ACCESS_KEY_ID?: string;

  @IsString()
  @IsOptional()
  SES_SECRET_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  SES_CONFIGURATION_SET?: string;

  // RabbitMQ
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

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
