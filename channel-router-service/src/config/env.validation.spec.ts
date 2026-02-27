import 'reflect-metadata';
import { validate } from './env.validation.js';

describe('EnvValidation', () => {
  it('should accept valid development config', () => {
    const config = {
      NODE_ENV: 'development',
      PORT: 3154,
      DB_HOST: 'localhost',
      DB_PORT: 5433,
    };

    expect(() => validate(config)).not.toThrow();
  });

  it('should accept valid production config', () => {
    const config = {
      NODE_ENV: 'production',
      PORT: 3154,
    };

    expect(() => validate(config)).not.toThrow();
  });

  it('should accept valid test config', () => {
    const config = {
      NODE_ENV: 'test',
    };

    expect(() => validate(config)).not.toThrow();
  });

  it('should reject invalid NODE_ENV', () => {
    const config = {
      NODE_ENV: 'invalid',
    };

    expect(() => validate(config)).toThrow();
  });

  it('should accept all optional variables', () => {
    const config = {
      NODE_ENV: 'development',
      PORT: 3154,
      DB_HOST: 'localhost',
      DB_PORT: 5433,
      DB_NAME: 'postgres',
      DB_SCHEMA: 'channel_router_service',
      DB_USER: 'channel_router_service_user',
      DB_PASSWORD: 'secret',
      RABBITMQ_HOST: 'localhost',
      RABBITMQ_PORT: 5672,
      RABBITMQ_MANAGEMENT_URL: 'http://localhost:15672',
      RABBITMQ_VHOST: 'vhnotificationapi',
      RABBITMQ_USER: 'notificationapi',
      RABBITMQ_PASSWORD: 'secret',
      PROVIDER_CACHE_ENABLED: 'true',
      PROVIDER_CACHE_TTL_SECONDS: 300,
      ADAPTER_HTTP_TIMEOUT_MS: 10000,
      ADAPTER_HEALTH_CHECK_INTERVAL_MS: 30000,
      CB_FAILURE_THRESHOLD: 5,
      CB_FAILURE_WINDOW_MS: 60000,
      CB_COOLDOWN_MS: 30000,
      CB_HALF_OPEN_MAX_ATTEMPTS: 1,
      CB_SUCCESS_THRESHOLD: 2,
      RETRY_EMAIL_MAX: 5,
      RETRY_SMS_MAX: 3,
      RETRY_WHATSAPP_MAX: 4,
      RETRY_PUSH_MAX: 4,
      RETRY_BACKOFF_MULTIPLIER: 2,
      RETRY_JITTER_FACTOR: 0.2,
      MEDIA_DOWNLOAD_TIMEOUT_MS: 10000,
      MEDIA_MAX_FILE_SIZE_MB: 10,
      MEDIA_MAX_TOTAL_SIZE_MB: 30,
      CONSUMER_PREFETCH_CRITICAL: 5,
      CONSUMER_PREFETCH_NORMAL: 10,
    };

    expect(() => validate(config)).not.toThrow();
  });

  it('should accept empty config with defaults', () => {
    expect(() => validate({})).not.toThrow();
  });
});
