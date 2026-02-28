import 'reflect-metadata';
import { validate } from './env.validation.js';

describe('env.validation', () => {
  it('should validate with default values (all optional)', () => {
    const result = validate({});
    expect(result).toBeDefined();
    expect(result.NODE_ENV).toBe('development');
  });

  it('should accept valid environment values', () => {
    const result = validate({
      NODE_ENV: 'production',
      PORT: 3158,
      DB_HOST: 'localhost',
      DB_PORT: 5433,
    });
    expect(result.NODE_ENV).toBe('production');
  });

  it('should accept test environment', () => {
    const result = validate({ NODE_ENV: 'test' });
    expect(result.NODE_ENV).toBe('test');
  });

  it('should throw for invalid NODE_ENV', () => {
    expect(() => validate({ NODE_ENV: 'invalid' })).toThrow();
  });

  it('should accept all upload-related env vars', () => {
    const result = validate({
      UPLOAD_TEMP_DIR: '/tmp/uploads',
      UPLOAD_RESULT_DIR: '/tmp/results',
      UPLOAD_MAX_FILE_SIZE_MB: 20,
      UPLOAD_MAX_ROWS: 10000,
    });
    expect(result).toBeDefined();
  });

  it('should accept worker settings', () => {
    const result = validate({
      WORKER_BATCH_SIZE: 100,
      WORKER_CONCURRENCY: 10,
      WORKER_RATE_LIMIT: 100,
      WORKER_POLL_INTERVAL_MS: 5000,
      WORKER_REQUEST_TIMEOUT_MS: 15000,
    });
    expect(result).toBeDefined();
  });

  it('should accept circuit breaker settings', () => {
    const result = validate({
      CIRCUIT_BREAKER_THRESHOLD: 5,
      CIRCUIT_BREAKER_COOLDOWN_MS: 60000,
    });
    expect(result).toBeDefined();
  });

  it('should accept retention settings', () => {
    const result = validate({
      RESULT_RETENTION_DAYS: 60,
      UPLOAD_RETENTION_DAYS: 180,
    });
    expect(result).toBeDefined();
  });

  it('should accept RabbitMQ settings', () => {
    const result = validate({
      RABBITMQ_HOST: 'rabbitmq',
      RABBITMQ_PORT: 5672,
      RABBITMQ_VHOST: 'test',
      RABBITMQ_USER: 'user',
      RABBITMQ_PASSWORD: 'pass',
    });
    expect(result).toBeDefined();
  });

  it('should accept group mode settings', () => {
    const result = validate({
      GROUP_KEY_COLUMN: 'orderId',
      GROUP_ITEMS_PREFIX: 'item.',
      GROUP_ITEMS_TARGET_FIELD: 'items',
      GROUP_CONFLICT_MODE: 'warn',
    });
    expect(result).toBeDefined();
  });

  it('should accept EVENT_INGESTION_URL', () => {
    const result = validate({
      EVENT_INGESTION_URL: 'http://localhost:3151',
    });
    expect(result).toBeDefined();
  });
});
