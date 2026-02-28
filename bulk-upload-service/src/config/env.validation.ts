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

  // RabbitMQ (optional — service works without it, graceful degradation)
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

  // Upload settings
  @IsString()
  @IsOptional()
  UPLOAD_TEMP_DIR?: string;

  @IsString()
  @IsOptional()
  UPLOAD_RESULT_DIR?: string;

  @IsNumber()
  @IsOptional()
  UPLOAD_MAX_FILE_SIZE_MB?: number;

  @IsNumber()
  @IsOptional()
  UPLOAD_MAX_ROWS?: number;

  // Group mode settings
  @IsString()
  @IsOptional()
  GROUP_KEY_COLUMN?: string;

  @IsString()
  @IsOptional()
  GROUP_ITEMS_PREFIX?: string;

  @IsString()
  @IsOptional()
  GROUP_ITEMS_TARGET_FIELD?: string;

  @IsString()
  @IsOptional()
  GROUP_CONFLICT_MODE?: string;

  // Worker settings
  @IsNumber()
  @IsOptional()
  WORKER_BATCH_SIZE?: number;

  @IsNumber()
  @IsOptional()
  WORKER_CONCURRENCY?: number;

  @IsNumber()
  @IsOptional()
  WORKER_RATE_LIMIT?: number;

  @IsNumber()
  @IsOptional()
  WORKER_POLL_INTERVAL_MS?: number;

  @IsNumber()
  @IsOptional()
  WORKER_REQUEST_TIMEOUT_MS?: number;

  // Circuit breaker settings
  @IsNumber()
  @IsOptional()
  CIRCUIT_BREAKER_THRESHOLD?: number;

  @IsNumber()
  @IsOptional()
  CIRCUIT_BREAKER_COOLDOWN_MS?: number;

  // Retention settings
  @IsNumber()
  @IsOptional()
  RESULT_RETENTION_DAYS?: number;

  @IsNumber()
  @IsOptional()
  UPLOAD_RETENTION_DAYS?: number;

  @IsNumber()
  @IsOptional()
  UPLOAD_RATE_LIMIT_PER_HOUR?: number;

  @IsString()
  @IsOptional()
  EVENT_INGESTION_URL?: string;
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
