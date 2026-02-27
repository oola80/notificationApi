import rabbitmqConfig from './rabbitmq.config.js';

describe('rabbitmqConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars are not set', () => {
    delete process.env.RABBITMQ_HOST;
    delete process.env.RABBITMQ_PORT;
    delete process.env.RABBITMQ_VHOST;
    delete process.env.RABBITMQ_USER;
    delete process.env.RABBITMQ_PASSWORD;

    const config = rabbitmqConfig();

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5672);
    expect(config.vhost).toBe('vhnotificationapi');
    expect(config.user).toBe('notificationapi');
    expect(config.password).toBe('');
  });

  it('should read env variables when set', () => {
    process.env.RABBITMQ_HOST = 'rabbit.example.com';
    process.env.RABBITMQ_PORT = '5673';
    process.env.RABBITMQ_VHOST = 'test-vhost';
    process.env.RABBITMQ_USER = 'testuser';
    process.env.RABBITMQ_PASSWORD = 'testpass';

    const config = rabbitmqConfig();

    expect(config.host).toBe('rabbit.example.com');
    expect(config.port).toBe(5673);
    expect(config.vhost).toBe('test-vhost');
    expect(config.user).toBe('testuser');
    expect(config.password).toBe('testpass');
  });
});
