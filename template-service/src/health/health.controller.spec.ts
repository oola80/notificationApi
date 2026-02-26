import { HealthController } from './health.controller.js';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('HealthController', () => {
  let controller: HealthController;
  let mockDataSource: any;
  let mockConfigService: any;
  let mockCacheService: any;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn((key: string, defaultVal?: any) => {
        const config: Record<string, any> = {
          'rabbitmq.managementUrl': 'http://localhost:15672',
          'rabbitmq.user': 'guest',
          'rabbitmq.password': 'guest',
        };
        return config[key] ?? defaultVal;
      }),
    };
    mockCacheService = {
      getStats: jest.fn().mockReturnValue({ size: 42, maxSize: 1000 }),
    };
    mockFetch.mockReset();
    controller = new HealthController(mockDataSource, mockConfigService, mockCacheService);
  });

  it('should return healthy when DB and RabbitMQ are up', async () => {
    mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    mockFetch.mockResolvedValue({ ok: true });

    const result = await controller.check();

    expect(result.status).toBe('healthy');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.rabbitmq.status).toBe('up');
  });

  it('should return degraded when DB is up but RabbitMQ is down', async () => {
    mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    mockFetch.mockRejectedValue(new Error('Connection refused'));

    const result = await controller.check();

    expect(result.status).toBe('degraded');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.rabbitmq.status).toBe('down');
  });

  it('should return unhealthy when DB is down', async () => {
    mockDataSource.query.mockRejectedValue(new Error('Connection refused'));
    mockFetch.mockResolvedValue({ ok: true });

    const result = await controller.check();

    expect(result.status).toBe('unhealthy');
    expect(result.checks.database.status).toBe('down');
  });

  it('should include uptime and service name', async () => {
    mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    mockFetch.mockResolvedValue({ ok: true });

    const result = await controller.check();

    expect(result.service).toBe('template-service');
    expect(result.version).toBe('0.0.1');
    expect(typeof result.uptime).toBe('number');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });

  it('should report database latency', async () => {
    mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    mockFetch.mockResolvedValue({ ok: true });

    const result = await controller.check();

    expect(typeof result.checks.database.latencyMs).toBe('number');
    expect(result.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should report RabbitMQ latency', async () => {
    mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    mockFetch.mockResolvedValue({ ok: true });

    const result = await controller.check();

    expect(typeof result.checks.rabbitmq.latencyMs).toBe('number');
    expect(result.checks.rabbitmq.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should include cache status with size and maxSize', async () => {
    mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    mockFetch.mockResolvedValue({ ok: true });

    const result = await controller.check();

    expect(result.checks.cache).toEqual({
      status: 'up',
      size: 42,
      maxSize: 1000,
    });
  });

  it('should report cache unavailable when cache service is not injected', async () => {
    const controllerWithoutCache = new HealthController(
      mockDataSource,
      mockConfigService,
    );
    mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    mockFetch.mockResolvedValue({ ok: true });

    const result = await controllerWithoutCache.check();

    expect(result.checks.cache).toEqual({
      status: 'unavailable',
      size: 0,
      maxSize: 0,
    });
  });

  it('should handle RabbitMQ management API returning non-ok status', async () => {
    mockDataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    mockFetch.mockResolvedValue({ ok: false, status: 503 });

    const result = await controller.check();

    expect(result.checks.rabbitmq.status).toBe('down');
  });
});
