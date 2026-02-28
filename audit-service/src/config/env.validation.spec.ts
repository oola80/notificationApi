import 'reflect-metadata';
import { validate } from './env.validation';

describe('Environment Validation', () => {
  it('should accept valid configuration with defaults', () => {
    const result = validate({});
    expect(result).toBeDefined();
  });

  it('should accept valid NODE_ENV values', () => {
    expect(() => validate({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => validate({ NODE_ENV: 'production' })).not.toThrow();
    expect(() => validate({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('should reject invalid NODE_ENV', () => {
    expect(() => validate({ NODE_ENV: 'staging' })).toThrow();
  });

  it('should accept numeric PORT', () => {
    const result = validate({ PORT: 3156 });
    expect(result).toBeDefined();
  });

  it('should accept all optional database settings', () => {
    const result = validate({
      DB_HOST: 'localhost',
      DB_PORT: 5433,
      DB_NAME: 'postgres',
      DB_SCHEMA: 'audit_service',
      DB_USER: 'audit_service_user',
      DB_PASSWORD: 'password123',
    });
    expect(result).toBeDefined();
  });

  it('should accept all optional RabbitMQ settings', () => {
    const result = validate({
      RABBITMQ_HOST: 'localhost',
      RABBITMQ_PORT: 5672,
      RABBITMQ_MANAGEMENT_URL: 'http://localhost:15672',
      RABBITMQ_VHOST: 'vhnotificationapi',
      RABBITMQ_USER: 'notificationapi',
      RABBITMQ_PASSWORD: 'password',
    });
    expect(result).toBeDefined();
  });

  it('should accept consumer settings', () => {
    const result = validate({
      CONSUMER_BATCH_SIZE: 100,
      CONSUMER_FLUSH_INTERVAL_MS: 3000,
      CONSUMER_RETRY_DELAY_MS: 10000,
      CONSUMER_MAX_RETRIES: 5,
    });
    expect(result).toBeDefined();
  });

  it('should accept retention and analytics settings', () => {
    const result = validate({
      RETENTION_PAYLOAD_DAYS: 90,
      RETENTION_METADATA_DAYS: 730,
      ANALYTICS_HOURLY_CRON: '5 * * * *',
      ANALYTICS_DAILY_CRON: '15 0 * * *',
      SEARCH_MAX_RESULTS: 200,
    });
    expect(result).toBeDefined();
  });
});
