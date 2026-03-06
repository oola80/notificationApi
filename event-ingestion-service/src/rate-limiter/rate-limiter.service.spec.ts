import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimiterService } from './rate-limiter.service.js';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  const createService = async (webhookRateLimit = 5) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'app.webhookRateLimit') return webhookRateLimit;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
    return module;
  };

  beforeEach(async () => {
    await createService(5);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkGlobalWebhookLimit', () => {
    it('should allow requests within the limit', () => {
      for (let i = 0; i < 5; i++) {
        expect(service.checkGlobalWebhookLimit()).toBe(true);
      }
    });

    it('should reject request when limit is exceeded', () => {
      for (let i = 0; i < 5; i++) {
        service.checkGlobalWebhookLimit();
      }

      expect(service.checkGlobalWebhookLimit()).toBe(false);
    });

    it('should allow requests again after the window slides', async () => {
      for (let i = 0; i < 5; i++) {
        service.checkGlobalWebhookLimit();
      }

      expect(service.checkGlobalWebhookLimit()).toBe(false);

      // Wait for window to expire (1 second)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(service.checkGlobalWebhookLimit()).toBe(true);
    }, 10000);
  });

  describe('checkSourceLimit', () => {
    it('should allow requests within the per-source limit', () => {
      expect(service.checkSourceLimit('shopify', 3)).toBe(true);
      expect(service.checkSourceLimit('shopify', 3)).toBe(true);
      expect(service.checkSourceLimit('shopify', 3)).toBe(true);
    });

    it('should reject when per-source limit is exceeded', () => {
      service.checkSourceLimit('shopify', 2);
      service.checkSourceLimit('shopify', 2);

      expect(service.checkSourceLimit('shopify', 2)).toBe(false);
    });

    it('should maintain independent counters per source', () => {
      // Fill shopify limit
      service.checkSourceLimit('shopify', 2);
      service.checkSourceLimit('shopify', 2);
      expect(service.checkSourceLimit('shopify', 2)).toBe(false);

      // Magento should still be allowed
      expect(service.checkSourceLimit('magento', 2)).toBe(true);
    });

    it('should not interfere with global webhook limit', () => {
      // Fill source limit
      service.checkSourceLimit('shopify', 1);
      expect(service.checkSourceLimit('shopify', 1)).toBe(false);

      // Global limit should still work independently
      expect(service.checkGlobalWebhookLimit()).toBe(true);
    });
  });

  describe('with high limit', () => {
    it('should allow many requests with high limit', async () => {
      await createService(1000);

      for (let i = 0; i < 1000; i++) {
        expect(service.checkGlobalWebhookLimit()).toBe(true);
      }
      expect(service.checkGlobalWebhookLimit()).toBe(false);
    });
  });

  describe('boundary behavior', () => {
    it('should reject at exactly limit + 1', async () => {
      await createService(3);

      expect(service.checkGlobalWebhookLimit()).toBe(true);
      expect(service.checkGlobalWebhookLimit()).toBe(true);
      expect(service.checkGlobalWebhookLimit()).toBe(true);
      expect(service.checkGlobalWebhookLimit()).toBe(false);
    });
  });

  describe('concurrent rate limiting', () => {
    it('should allow 10 and reject 2 with limit=10 on rapid calls', async () => {
      await createService(10);

      let allowed = 0;
      let rejected = 0;

      for (let i = 0; i < 12; i++) {
        if (service.checkGlobalWebhookLimit()) {
          allowed++;
        } else {
          rejected++;
        }
      }

      expect(allowed).toBe(10);
      expect(rejected).toBe(2);
    });

    it('should independently limit two sources with limit=3 each', async () => {
      await createService(100); // high global limit to not interfere

      let sourceAAllowed = 0;
      let sourceBAllowed = 0;

      for (let i = 0; i < 5; i++) {
        if (service.checkSourceLimit('sourceA', 3)) sourceAAllowed++;
        if (service.checkSourceLimit('sourceB', 3)) sourceBAllowed++;
      }

      expect(sourceAAllowed).toBe(3);
      expect(sourceBAllowed).toBe(3);
    });
  });
});
