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

  @IsString()
  @IsOptional()
  TEMPLATE_SERVICE_URL?: string;

  @IsString()
  @IsOptional()
  RULE_CACHE_ENABLED?: string;

  @IsString()
  @IsOptional()
  PREFERENCE_WEBHOOK_API_KEY?: string;

  @IsString()
  @IsOptional()
  PREF_CACHE_ENABLED?: string;

  @IsNumber()
  @IsOptional()
  PREF_CACHE_TTL_SECONDS?: number;

  @IsNumber()
  @IsOptional()
  PREF_CACHE_MAX_SIZE?: number;

  @IsString()
  @IsOptional()
  OVERRIDE_CACHE_ENABLED?: string;

  @IsNumber()
  @IsOptional()
  RABBITMQ_PREFETCH?: number;

  @IsNumber()
  @IsOptional()
  DLQ_MAX_RETRIES?: number;

  @IsNumber()
  @IsOptional()
  RETRY_INITIAL_DELAY_MS?: number;

  @IsNumber()
  @IsOptional()
  RETRY_BACKOFF_MULTIPLIER?: number;

  @IsNumber()
  @IsOptional()
  RETRY_MAX_DELAY_MS?: number;

  @IsNumber()
  @IsOptional()
  TEMPLATE_SERVICE_CB_THRESHOLD?: number;

  @IsNumber()
  @IsOptional()
  TEMPLATE_SERVICE_CB_RESET_MS?: number;

  @IsNumber()
  @IsOptional()
  RABBITMQ_PREFETCH_CRITICAL?: number;

  @IsNumber()
  @IsOptional()
  RABBITMQ_PREFETCH_NORMAL?: number;
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
