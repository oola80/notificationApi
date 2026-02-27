import databaseConfig from './database.config.js';

describe('DatabaseConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return defaults when env vars are not set', () => {
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_SCHEMA;

    const config = databaseConfig();
    expect(config.host).toBe('localhost');
    expect(config.port).toBe(5433);
    expect(config.schema).toBe('channel_router_service');
  });

  it('should parse env overrides', () => {
    process.env.DB_HOST = 'db.example.com';
    process.env.DB_PORT = '5432';
    process.env.DB_NAME = 'mydb';

    const config = databaseConfig();
    expect(config.host).toBe('db.example.com');
    expect(config.port).toBe(5432);
    expect(config.name).toBe('mydb');
  });
});
