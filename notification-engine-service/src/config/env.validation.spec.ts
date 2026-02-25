import 'reflect-metadata';
import { validate } from './env.validation.js';

describe('env.validation', () => {
  it('should validate a valid config', () => {
    const config = {
      NODE_ENV: 'development',
      PORT: '3152',
      DB_HOST: 'localhost',
    };

    const result = validate(config);

    expect(result).toBeDefined();
    expect(result.NODE_ENV).toBe('development');
  });

  it('should accept test environment', () => {
    const config = { NODE_ENV: 'test' };

    const result = validate(config);

    expect(result.NODE_ENV).toBe('test');
  });

  it('should accept production environment', () => {
    const config = { NODE_ENV: 'production' };

    const result = validate(config);

    expect(result.NODE_ENV).toBe('production');
  });

  it('should throw for invalid NODE_ENV', () => {
    const config = { NODE_ENV: 'invalid' };

    expect(() => validate(config)).toThrow();
  });

  it('should accept empty config (all optional)', () => {
    const config = {};

    const result = validate(config);

    expect(result).toBeDefined();
    expect(result.NODE_ENV).toBe('development');
  });

  it('should accept NES-specific variables', () => {
    const config = {
      TEMPLATE_SERVICE_URL: 'http://localhost:3153',
      RULE_CACHE_ENABLED: 'true',
      PREFERENCE_WEBHOOK_API_KEY: 'my-api-key',
    };

    const result = validate(config);

    expect(result.TEMPLATE_SERVICE_URL).toBe('http://localhost:3153');
    expect(result.RULE_CACHE_ENABLED).toBe('true');
    expect(result.PREFERENCE_WEBHOOK_API_KEY).toBe('my-api-key');
  });
});
