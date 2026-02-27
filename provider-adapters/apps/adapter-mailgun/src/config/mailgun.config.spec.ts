import mailgunConfig from './mailgun.config.js';

describe('mailgunConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars are not set', () => {
    delete process.env.MAILGUN_PORT;
    delete process.env.MAILGUN_API_KEY;
    delete process.env.MAILGUN_DOMAIN;
    delete process.env.MAILGUN_FROM_ADDRESS;
    delete process.env.MAILGUN_REGION;
    delete process.env.MAILGUN_WEBHOOK_SIGNING_KEY;

    const config = mailgunConfig();

    expect(config.port).toBe(3171);
    expect(config.domain).toBe('distelsa.info');
    expect(config.fromAddress).toBe('notifications@distelsa.info');
    expect(config.region).toBe('us');
    expect(config.baseUrl).toBe('https://api.mailgun.net/v3');
  });

  it('should use EU base URL when region is eu', () => {
    process.env.MAILGUN_REGION = 'eu';

    const config = mailgunConfig();

    expect(config.region).toBe('eu');
    expect(config.baseUrl).toBe('https://api.eu.mailgun.net/v3');
  });

  it('should use US base URL for non-eu regions', () => {
    process.env.MAILGUN_REGION = 'us';

    const config = mailgunConfig();

    expect(config.baseUrl).toBe('https://api.mailgun.net/v3');
  });

  it('should read env variables when set', () => {
    process.env.MAILGUN_PORT = '4000';
    process.env.MAILGUN_API_KEY = 'test-key';
    process.env.MAILGUN_DOMAIN = 'custom.domain.com';
    process.env.MAILGUN_FROM_ADDRESS = 'test@custom.domain.com';

    const config = mailgunConfig();

    expect(config.port).toBe(4000);
    expect(config.apiKey).toBe('test-key');
    expect(config.domain).toBe('custom.domain.com');
    expect(config.fromAddress).toBe('test@custom.domain.com');
  });
});
