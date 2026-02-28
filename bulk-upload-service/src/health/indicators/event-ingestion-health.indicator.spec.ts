import { EventIngestionHealthIndicator } from './event-ingestion-health.indicator.js';

describe('EventIngestionHealthIndicator', () => {
  let indicator: EventIngestionHealthIndicator;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'app.eventIngestionUrl': 'http://localhost:3151',
        };
        return config[key] ?? defaultValue;
      }),
    };
    indicator = new EventIngestionHealthIndicator(mockConfigService);
  });

  it('should be defined', () => {
    expect(indicator).toBeDefined();
  });

  it('should return up when Event Ingestion responds ok', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
    } as Response);

    const result = await indicator.check();
    expect(result.status).toBe('up');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('should return down when Event Ingestion responds with error', async () => {
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
      .mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await indicator.check();
    expect(result.status).toBe('down');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
