import { SesHealthService } from './ses-health.service.js';

describe('SesHealthService', () => {
  let service: SesHealthService;
  let mockSesClient: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockSesClient = {
      checkConnectivity: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn((key: string, def?: any) => {
        const values: Record<string, any> = {
          'ses.region': 'us-east-1',
          'ses.mode': 'smtp',
        };
        return values[key] ?? def;
      }),
    };
    service = new SesHealthService(mockSesClient, mockConfigService);
  });

  it('should return correct providerId', () => {
    expect(service.getProviderId()).toBe('aws-ses');
  });

  it('should return correct providerName', () => {
    expect(service.getProviderName()).toBe('Amazon SES');
  });

  it('should return correct supported channels', () => {
    expect(service.getSupportedChannels()).toEqual(['email']);
  });

  describe('SMTP mode health check', () => {
    it('should return ok when SMTP client reports connectivity', async () => {
      mockSesClient.checkConnectivity.mockResolvedValue({
        ok: true,
        latencyMs: 50,
        details: {
          smtpHost: 'email-smtp.us-east-1.amazonaws.com',
          mode: 'smtp',
        },
      });

      const result = await service.checkProviderConnectivity();

      expect(result.ok).toBe(true);
      expect(result.latencyMs).toBe(50);
      expect(result.details.smtpHost).toBe(
        'email-smtp.us-east-1.amazonaws.com',
      );
      expect(result.details.region).toBe('us-east-1');
      expect(result.details.mode).toBe('smtp');
    });

    it('should return not ok when SMTP connection fails', async () => {
      mockSesClient.checkConnectivity.mockResolvedValue({
        ok: false,
        latencyMs: 100,
        details: {
          smtpHost: 'email-smtp.us-east-1.amazonaws.com',
          mode: 'smtp',
          error: 'Connection refused',
        },
      });

      const result = await service.checkProviderConnectivity();

      expect(result.ok).toBe(false);
    });
  });

  describe('API mode health check', () => {
    it('should return ok with quota details in API mode', async () => {
      mockSesClient.checkConnectivity.mockResolvedValue({
        ok: true,
        latencyMs: 30,
        details: {
          region: 'us-east-1',
          mode: 'api',
          maxSendRate: 14,
          max24HourSend: 50000,
          sentLast24Hours: 1234,
          sendingEnabled: true,
        },
      });

      const result = await service.checkProviderConnectivity();

      expect(result.ok).toBe(true);
      expect(result.details.mode).toBe('api');
      expect(result.details.maxSendRate).toBe(14);
      expect(result.details.sendingEnabled).toBe(true);
    });

    it('should return not ok when sending is disabled', async () => {
      mockSesClient.checkConnectivity.mockResolvedValue({
        ok: false,
        latencyMs: 25,
        details: {
          region: 'us-east-1',
          mode: 'api',
          sendingEnabled: false,
        },
      });

      const result = await service.checkProviderConnectivity();

      expect(result.ok).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should return not ok when checkConnectivity throws', async () => {
      mockSesClient.checkConnectivity.mockRejectedValue(
        new Error('Connection refused'),
      );

      const result = await service.checkProviderConnectivity();

      expect(result.ok).toBe(false);
      expect(result.details.error).toBe('Connection refused');
    });
  });

  describe('getHealth integration', () => {
    it('should return full health via getHealth()', async () => {
      mockSesClient.checkConnectivity.mockResolvedValue({
        ok: true,
        latencyMs: 40,
        details: { mode: 'smtp' },
      });

      const health = await service.getHealth();

      expect(health.status).toBe('ok');
      expect(health.providerId).toBe('aws-ses');
      expect(health.providerName).toBe('Amazon SES');
      expect(health.supportedChannels).toEqual(['email']);
    });

    it('should return down health when connectivity fails', async () => {
      mockSesClient.checkConnectivity.mockRejectedValue(
        new Error('Timeout'),
      );

      const health = await service.getHealth();

      expect(health.status).toBe('down');
      expect(health.providerId).toBe('aws-ses');
    });
  });
});
