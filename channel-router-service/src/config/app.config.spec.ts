import appConfig from './app.config.js';

describe('AppConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return default values when env vars are not set', () => {
    delete process.env.PORT;
    delete process.env.NODE_ENV;

    const config = appConfig();
    expect(config.port).toBe(3154);
    expect(config.nodeEnv).toBe('development');
  });

  it('should parse PORT from env', () => {
    process.env.PORT = '4000';
    const config = appConfig();
    expect(config.port).toBe(4000);
  });

  it('should parse provider cache config', () => {
    process.env.PROVIDER_CACHE_ENABLED = 'true';
    process.env.PROVIDER_CACHE_TTL_SECONDS = '600';

    const config = appConfig();
    expect(config.providerCacheEnabled).toBe(true);
    expect(config.providerCacheTtlSeconds).toBe(600);
  });

  it('should parse circuit breaker config', () => {
    process.env.CB_FAILURE_THRESHOLD = '10';
    process.env.CB_COOLDOWN_MS = '60000';

    const config = appConfig();
    expect(config.cbFailureThreshold).toBe(10);
    expect(config.cbCooldownMs).toBe(60000);
  });

  it('should parse retry config', () => {
    process.env.RETRY_EMAIL_MAX = '7';
    process.env.RETRY_JITTER_FACTOR = '0.3';

    const config = appConfig();
    expect(config.retryEmailMax).toBe(7);
    expect(config.retryJitterFactor).toBe(0.3);
  });

  it('should parse media config', () => {
    process.env.MEDIA_MAX_FILE_SIZE_MB = '20';

    const config = appConfig();
    expect(config.mediaMaxFileSizeMb).toBe(20);
  });

  it('should parse consumer config', () => {
    process.env.CONSUMER_PREFETCH_CRITICAL = '3';
    process.env.CONSUMER_PREFETCH_NORMAL = '15';

    const config = appConfig();
    expect(config.consumerPrefetchCritical).toBe(3);
    expect(config.consumerPrefetchNormal).toBe(15);
  });
});
