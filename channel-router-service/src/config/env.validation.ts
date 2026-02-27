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

  // Database
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

  // Provider Cache
  @IsString()
  @IsOptional()
  PROVIDER_CACHE_ENABLED?: string;

  @IsNumber()
  @IsOptional()
  PROVIDER_CACHE_TTL_SECONDS?: number;

  // Adapter
  @IsNumber()
  @IsOptional()
  ADAPTER_HTTP_TIMEOUT_MS?: number;

  @IsNumber()
  @IsOptional()
  ADAPTER_HEALTH_CHECK_INTERVAL_MS?: number;

  // Circuit Breaker
  @IsNumber()
  @IsOptional()
  CB_FAILURE_THRESHOLD?: number;

  @IsNumber()
  @IsOptional()
  CB_FAILURE_WINDOW_MS?: number;

  @IsNumber()
  @IsOptional()
  CB_COOLDOWN_MS?: number;

  @IsNumber()
  @IsOptional()
  CB_HALF_OPEN_MAX_ATTEMPTS?: number;

  @IsNumber()
  @IsOptional()
  CB_SUCCESS_THRESHOLD?: number;

  // Retry
  @IsNumber()
  @IsOptional()
  RETRY_EMAIL_MAX?: number;

  @IsNumber()
  @IsOptional()
  RETRY_SMS_MAX?: number;

  @IsNumber()
  @IsOptional()
  RETRY_WHATSAPP_MAX?: number;

  @IsNumber()
  @IsOptional()
  RETRY_PUSH_MAX?: number;

  @IsNumber()
  @IsOptional()
  RETRY_BACKOFF_MULTIPLIER?: number;

  @IsNumber()
  @IsOptional()
  RETRY_JITTER_FACTOR?: number;

  // Media
  @IsNumber()
  @IsOptional()
  MEDIA_DOWNLOAD_TIMEOUT_MS?: number;

  @IsNumber()
  @IsOptional()
  MEDIA_MAX_FILE_SIZE_MB?: number;

  @IsNumber()
  @IsOptional()
  MEDIA_MAX_TOTAL_SIZE_MB?: number;

  // Consumer
  @IsNumber()
  @IsOptional()
  CONSUMER_PREFETCH_CRITICAL?: number;

  @IsNumber()
  @IsOptional()
  CONSUMER_PREFETCH_NORMAL?: number;
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
