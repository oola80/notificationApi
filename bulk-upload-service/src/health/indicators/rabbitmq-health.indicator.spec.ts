import { RabbitMQHealthIndicator } from './rabbitmq-health.indicator.js';

describe('RabbitMQHealthIndicator', () => {
  let indicator: RabbitMQHealthIndicator;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'rabbitmq.managementUrl': 'http://localhost:15672',
          'rabbitmq.user': 'notificationapi',
          'rabbitmq.password': 'pass',
        };
        return config[key] ?? defaultValue;
      }),
    };
    indicator = new RabbitMQHealthIndicator(mockConfigService);
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  it('should return up when Management API responds ok', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
    } as Response);

    const result = await indicator.check();
    expect(result.status).toBe('up');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should return down when Management API responds with error', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as Response);

    const result = await indicator.check();
    expect(result.status).toBe('down');
  });

  it('should return down when fetch throws', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Connection refused'));

    const result = await indicator.check();
    expect(result.status).toBe('down');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
