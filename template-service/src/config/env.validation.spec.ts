import 'reflect-metadata';
import { validate } from './env.validation.js';

describe('env.validation', () => {
  it('should pass with valid config', () => {
    const config = {
      NODE_ENV: 'development',
      PORT: '3153',
      DB_HOST: 'localhost',
      DB_PORT: '5433',
      DB_NAME: 'postgres',
      DB_SCHEMA: 'template_service',
      DB_USER: 'template_service_user',
      DB_PASSWORD: 'secret',
      RABBITMQ_HOST: 'localhost',
      RABBITMQ_PORT: '5672',
      RABBITMQ_MANAGEMENT_URL: 'http://localhost:15672',
      RABBITMQ_VHOST: 'vhnotificationapi',
      RABBITMQ_USER: 'notificationapi',
      RABBITMQ_PASSWORD: 'secret',
    };

    const result = validate(config);
    expect(result).toBeDefined();
    expect(result.NODE_ENV).toBe('development');
  });

  it('should pass with minimal config (all optional)', () => {
    const result = validate({});
    expect(result).toBeDefined();
    expect(result.NODE_ENV).toBe('development');
  });

  it('should reject invalid NODE_ENV', () => {
    const config = { NODE_ENV: 'invalid_env' };
    expect(() => validate(config)).toThrow();
  });
});
