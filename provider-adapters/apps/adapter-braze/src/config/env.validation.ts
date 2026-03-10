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

  // Braze
  @IsNumber()
  @IsOptional()
  BRAZE_PORT?: number;

  @IsString()
  BRAZE_API_KEY!: string;

  @IsString()
  BRAZE_REST_ENDPOINT!: string;

  @IsString()
  BRAZE_APP_ID!: string;

  @IsString()
  BRAZE_WEBHOOK_KEY!: string;

  @IsString()
  BRAZE_FROM_EMAIL!: string;

  @IsString()
  @IsOptional()
  BRAZE_FROM_NAME?: string;

  @IsString()
  @IsOptional()
  BRAZE_SMS_SUBSCRIPTION_GROUP?: string;

  @IsString()
  @IsOptional()
  BRAZE_WHATSAPP_SUBSCRIPTION_GROUP?: string;

  @IsString()
  @IsOptional()
  BRAZE_PROFILE_SYNC_ENABLED?: string;

  @IsNumber()
  @IsOptional()
  BRAZE_PROFILE_CACHE_TTL_SECONDS?: number;

  @IsNumber()
  @IsOptional()
  BRAZE_TIMEOUT_MS?: number;

  @IsString()
  EMAIL_HASH_PEPPER!: string;

  @IsNumber()
  @IsOptional()
  PEPPER_CACHE_TTL?: number;

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
