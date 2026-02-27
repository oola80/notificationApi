import rabbitmqConfig from './rabbitmq.config.js';

describe('RabbitmqConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return defaults when env vars are not set', () => {
    delete process.env.RABBITMQ_HOST;
    delete process.env.RABBITMQ_PORT;

    const config = rabbitmqConfig();
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5672);
    expect(config.vhost).toBe('vhnotificationapi');
  });

  it('should parse env overrides', () => {
    process.env.RABBITMQ_HOST = 'rmq.example.com';
    process.env.RABBITMQ_PORT = '5673';
    process.env.RABBITMQ_MANAGEMENT_URL = 'http://rmq.example.com:15672';

    const config = rabbitmqConfig();
    expect(config.host).toBe('rmq.example.com');
    expect(config.port).toBe(5673);
    expect(config.managementUrl).toBe('http://rmq.example.com:15672');
  });
});
