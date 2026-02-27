import { HealthController } from './health.controller.js';
import { MailgunHealthService } from './mailgun-health.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  let mockHealthService: Partial<MailgunHealthService>;

  beforeEach(() => {
    mockHealthService = {
      getHealth: jest.fn().mockResolvedValue({
        status: 'ok',
        providerId: 'mailgun',
        providerName: 'Mailgun',
        supportedChannels: ['email'],
        latencyMs: 100,
        details: { domain: 'distelsa.info', state: 'active', region: 'us' },
      }),
    };
    controller = new HealthController(
      mockHealthService as MailgunHealthService,
    );
  });

  describe('GET /health', () => {
    it('should return health status from MailgunHealthService', async () => {
      const result = await controller.getHealth();

      expect(result.status).toBe('ok');
      expect(result.providerId).toBe('mailgun');
      expect(result.providerName).toBe('Mailgun');
      expect(result.supportedChannels).toEqual(['email']);
      expect(mockHealthService.getHealth).toHaveBeenCalled();
    });
  });

  describe('GET /capabilities', () => {
    it('should return Mailgun capabilities', () => {
      const result = controller.getCapabilities();

      expect(result.providerId).toBe('mailgun');
      expect(result.providerName).toBe('Mailgun');
      expect(result.supportedChannels).toEqual(['email']);
      expect(result.supportsAttachments).toBe(true);
      expect(result.supportsMediaUrls).toBe(false);
      expect(result.maxAttachmentSizeMb).toBe(25);
      expect(result.maxRecipientsPerRequest).toBe(1000);
      expect(result.webhookPath).toBe('/webhooks/inbound');
    });
  });
});
