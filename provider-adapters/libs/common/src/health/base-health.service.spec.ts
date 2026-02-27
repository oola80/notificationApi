import { BaseHealthService } from './base-health.service.js';

class TestHealthService extends BaseHealthService {
  private connectivityResult: {
    ok: boolean;
    latencyMs: number;
    details: Record<string, any>;
  };

  constructor(result: { ok: boolean; latencyMs: number; details: Record<string, any> }) {
    super();
    this.connectivityResult = result;
  }

  getProviderId(): string {
    return 'test-provider';
  }
  getProviderName(): string {
    return 'Test Provider';
  }
  getSupportedChannels(): string[] {
    return ['email', 'sms'];
  }
  async checkProviderConnectivity() {
    return this.connectivityResult;
  }
}

describe('BaseHealthService', () => {
  it('should return ok when connectivity is good and fast', async () => {
    const service = new TestHealthService({
      ok: true,
      latencyMs: 100,
      details: { region: 'us' },
    });

    const result = await service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.providerId).toBe('test-provider');
    expect(result.providerName).toBe('Test Provider');
    expect(result.supportedChannels).toEqual(['email', 'sms']);
    expect(result.latencyMs).toBe(100);
    expect(result.details).toEqual({ region: 'us' });
  });

  it('should return degraded when connectivity is ok but slow', async () => {
    const service = new TestHealthService({
      ok: true,
      latencyMs: 6000,
      details: {},
    });

    const result = await service.getHealth();
    expect(result.status).toBe('degraded');
  });

  it('should return down when connectivity fails', async () => {
    const service = new TestHealthService({
      ok: false,
      latencyMs: 5001,
      details: { error: 'Connection refused' },
    });

    const result = await service.getHealth();
    expect(result.status).toBe('down');
  });

  it('should return down even with low latency if not ok', async () => {
    const service = new TestHealthService({
      ok: false,
      latencyMs: 50,
      details: { error: 'Auth failed' },
    });

    const result = await service.getHealth();
    expect(result.status).toBe('down');
  });
});
