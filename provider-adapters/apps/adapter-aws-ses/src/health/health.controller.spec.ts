import { HealthController } from './health.controller.js';
import { SesHealthService } from './ses-health.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  let mockHealthService: Partial<SesHealthService>;
  let mockConfigService: any;

  beforeEach(() => {
    mockHealthService = {
      getHealth: jest.fn().mockResolvedValue({
        status: 'ok',
        providerId: 'aws-ses',
        providerName: 'Amazon SES',
        supportedChannels: ['email'],
        latencyMs: 100,
        details: {
          smtpHost: 'email-smtp.us-east-1.amazonaws.com',
          region: 'us-east-1',
          mode: 'smtp',
        },
      }),
    };
    mockConfigService = {
      get: jest.fn((key: string, def?: any) => {
        const values: Record<string, any> = {
          'ses.mode': 'smtp',
        };
        return values[key] ?? def;
      }),
    };
    controller = new HealthController(
      mockHealthService as SesHealthService,
      mockConfigService,
    );
  });

  describe('GET /health', () => {
    it('should return health status from SesHealthService', async () => {
      const result = await controller.getHealth();

      expect(result.status).toBe('ok');
      expect(result.providerId).toBe('aws-ses');
      expect(result.providerName).toBe('Amazon SES');
      expect(result.supportedChannels).toEqual(['email']);
      expect(mockHealthService.getHealth).toHaveBeenCalled();
    });
  });

  describe('GET /capabilities', () => {
    it('should return AWS SES capabilities with SMTP mode defaults', () => {
      const result = controller.getCapabilities();

      expect(result.providerId).toBe('aws-ses');
      expect(result.providerName).toBe('Amazon SES');
      expect(result.supportedChannels).toEqual(['email']);
      expect(result.supportsAttachments).toBe(true);
      expect(result.supportsMediaUrls).toBe(false);
      expect(result.maxAttachmentSizeMb).toBe(40);
      expect(result.maxRecipientsPerRequest).toBe(50);
      expect(result.webhookPath).toBe('/webhooks/inbound');
    });

    it('should return maxAttachmentSizeMb=10 in API mode', () => {
      mockConfigService.get.mockReturnValue('api');
      controller = new HealthController(
        mockHealthService as SesHealthService,
        mockConfigService,
      );

      const result = controller.getCapabilities();

      expect(result.maxAttachmentSizeMb).toBe(10);
    });
  });
});
