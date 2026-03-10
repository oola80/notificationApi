import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '@app/common';
import { WebhookVerificationService } from './webhook-verification.service.js';

const WEBHOOK_KEY = 'test-braze-webhook-key-12345';

describe('WebhookVerificationService', () => {
  let service: WebhookVerificationService;
  let metricsService: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookVerificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'braze.webhookKey') return WEBHOOK_KEY;
              return '';
            }),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementWebhookVerificationFailures: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WebhookVerificationService);
    metricsService = module.get(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('valid key', () => {
    it('should return true when provided key matches configured key', () => {
      expect(service.verify(WEBHOOK_KEY)).toBe(true);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).not.toHaveBeenCalled();
    });
  });

  describe('invalid key', () => {
    it('should return false when provided key does not match', () => {
      expect(service.verify('wrong-key-value-12345')).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('braze');
    });

    it('should return false for an empty string key', () => {
      expect(service.verify('')).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('braze');
    });

    it('should return false when key differs by a single character', () => {
      const almostCorrect =
        WEBHOOK_KEY.slice(0, -1) +
        (WEBHOOK_KEY.slice(-1) === 'a' ? 'b' : 'a');
      expect(service.verify(almostCorrect)).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('braze');
    });
  });

  describe('missing header', () => {
    it('should return false when key is undefined', () => {
      expect(service.verify(undefined)).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('braze');
    });

    it('should return false when key is null', () => {
      expect(service.verify(null as any)).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('braze');
    });
  });

  describe('timing-safe comparison', () => {
    it('should use constant-time comparison (last character difference)', () => {
      const chars = WEBHOOK_KEY.split('');
      chars[chars.length - 1] =
        chars[chars.length - 1] === 'a' ? 'b' : 'a';
      const tamperedKey = chars.join('');

      expect(service.verify(tamperedKey)).toBe(false);
    });

    it('should use constant-time comparison (first character difference)', () => {
      const chars = WEBHOOK_KEY.split('');
      chars[0] = chars[0] === 'a' ? 'b' : 'a';
      const tamperedKey = chars.join('');

      expect(service.verify(tamperedKey)).toBe(false);
    });

    it('should return false when key length differs (prevents timingSafeEqual crash)', () => {
      expect(service.verify('short')).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('braze');
    });
  });

  describe('unconfigured webhook key', () => {
    it('should return false when BRAZE_WEBHOOK_KEY is empty', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WebhookVerificationService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn(() => ''),
            },
          },
          {
            provide: MetricsService,
            useValue: {
              incrementWebhookVerificationFailures: jest.fn(),
            },
          },
        ],
      }).compile();

      const svc = module.get(WebhookVerificationService);
      expect(svc.verify('some-key')).toBe(false);
    });
  });
});
