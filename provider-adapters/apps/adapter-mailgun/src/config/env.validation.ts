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

  // Mailgun
  @IsNumber()
  @IsOptional()
  MAILGUN_PORT?: number;

  @IsString()
  @IsOptional()
  MAILGUN_API_KEY?: string;

  @IsString()
  @IsOptional()
  MAILGUN_DOMAIN?: string;

  @IsString()
  @IsOptional()
  MAILGUN_FROM_ADDRESS?: string;

  @IsString()
  @IsOptional()
  MAILGUN_REGION?: string;

  @IsString()
  @IsOptional()
  MAILGUN_WEBHOOK_SIGNING_KEY?: string;

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
