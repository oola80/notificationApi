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

  @IsNumber()
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsOptional()
  DB_HOST?: string;

  @IsNumber()
  @IsOptional()
  DB_PORT?: number;

  @IsString()
  @IsOptional()
  DB_NAME?: string;

  @IsString()
  @IsOptional()
  DB_SCHEMA?: string;

  @IsString()
  @IsOptional()
  DB_USER?: string;

  @IsString()
  @IsOptional()
  DB_PASSWORD?: string;

  // RabbitMQ
  @IsString()
  @IsOptional()
  RABBITMQ_HOST?: string;

  @IsNumber()
  @IsOptional()
  RABBITMQ_PORT?: number;

  @IsString()
  @IsOptional()
  RABBITMQ_MANAGEMENT_URL?: string;

  @IsString()
  @IsOptional()
  RABBITMQ_VHOST?: string;

  @IsString()
  @IsOptional()
  RABBITMQ_USER?: string;

  @IsString()
  @IsOptional()
  RABBITMQ_PASSWORD?: string;

  // Consumer settings
  @IsNumber()
  @IsOptional()
  CONSUMER_BATCH_SIZE?: number;

  @IsNumber()
  @IsOptional()
  CONSUMER_FLUSH_INTERVAL_MS?: number;

  @IsNumber()
  @IsOptional()
  CONSUMER_RETRY_DELAY_MS?: number;

  @IsNumber()
  @IsOptional()
  CONSUMER_MAX_RETRIES?: number;

  // Retention
  @IsNumber()
  @IsOptional()
  RETENTION_PAYLOAD_DAYS?: number;

  @IsNumber()
  @IsOptional()
  RETENTION_METADATA_DAYS?: number;

  // Analytics
  @IsString()
  @IsOptional()
  ANALYTICS_HOURLY_CRON?: string;

  @IsString()
  @IsOptional()
  ANALYTICS_DAILY_CRON?: string;

  // Search
  @IsNumber()
  @IsOptional()
  SEARCH_MAX_RESULTS?: number;

  // Logging
  @IsString()
  @IsOptional()
  LOG_LEVEL?: string;
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
