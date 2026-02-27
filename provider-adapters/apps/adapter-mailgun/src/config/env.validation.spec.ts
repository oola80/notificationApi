import { validate } from './env.validation.js';

describe('env.validation', () => {
  it('should validate with default values', () => {
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

  it('should accept valid Mailgun env vars', () => {
    const result = validate({
      MAILGUN_PORT: 3171,
      MAILGUN_API_KEY: 'test-key',
      MAILGUN_DOMAIN: 'distelsa.info',
      MAILGUN_FROM_ADDRESS: 'notifications@distelsa.info',
      MAILGUN_REGION: 'us',
    });
    expect(result).toBeDefined();
  });

  it('should accept valid RabbitMQ env vars', () => {
    const result = validate({
      RABBITMQ_HOST: 'localhost',
      RABBITMQ_PORT: 5672,
      RABBITMQ_VHOST: 'vhnotificationapi',
      RABBITMQ_USER: 'notificationapi',
      RABBITMQ_PASSWORD: 'secret',
    });
    expect(result).toBeDefined();
  });
});
