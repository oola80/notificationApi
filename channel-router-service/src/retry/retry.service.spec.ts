import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RetryService } from './retry.service.js';
import { MetricsService } from '../metrics/metrics.service.js';

describe('RetryService', () => {
  let service: RetryService;
  let metricsService: {
    incrementRetry: jest.Mock;
  };

  const RETRY_EMAIL_MAX = 5;
  const RETRY_SMS_MAX = 3;
  const RETRY_WHATSAPP_MAX = 4;
  const RETRY_PUSH_MAX = 4;
  const BACKOFF_MULTIPLIER = 2;
  const JITTER_FACTOR = 0.2;
  const BASE_DELAY_MS = 5000;

  beforeEach(async () => {
    metricsService = {
      incrementRetry: jest.fn(),
    };

    const configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const configMap: Record<string, any> = {
          'app.retryEmailMax': RETRY_EMAIL_MAX,
          'app.retrySmsMax': RETRY_SMS_MAX,
          'app.retryWhatsappMax': RETRY_WHATSAPP_MAX,
          'app.retryPushMax': RETRY_PUSH_MAX,
          'app.retryBackoffMultiplier': BACKOFF_MULTIPLIER,
          'app.retryJitterFactor': JITTER_FACTOR,
        };
        return configMap[key] ?? defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RetryService,
        { provide: ConfigService, useValue: configService },
        { provide: MetricsService, useValue: metricsService },
      ],
    }).compile();

    service = module.get<RetryService>(RetryService);
  });

  describe('getRetryPolicy', () => {
    it('should return correct policy for email', () => {
      const policy = service.getRetryPolicy('email');
      expect(policy.maxRetries).toBe(RETRY_EMAIL_MAX);
      expect(policy.baseDelayMs).toBe(BASE_DELAY_MS);
    });

    it('should return correct policy for sms', () => {
      const policy = service.getRetryPolicy('sms');
      expect(policy.maxRetries).toBe(RETRY_SMS_MAX);
    });

    it('should return correct policy for whatsapp', () => {
      const policy = service.getRetryPolicy('whatsapp');
      expect(policy.maxRetries).toBe(RETRY_WHATSAPP_MAX);
    });

    it('should return correct policy for push', () => {
      const policy = service.getRetryPolicy('push');
      expect(policy.maxRetries).toBe(RETRY_PUSH_MAX);
    });

    it('should return default policy for unknown channel', () => {
      const policy = service.getRetryPolicy('carrier-pigeon');
      expect(policy.maxRetries).toBe(3);
      expect(policy.baseDelayMs).toBe(BASE_DELAY_MS);
    });
  });

  describe('calculateDelay', () => {
    it('should calculate delay for attempt 0 (first retry)', () => {
      const delay = service.calculateDelay('email', 0);
      // baseDelay * 2^0 = 5000, + jitter up to 5000 * 0.2 = 1000
      expect(delay).toBeGreaterThanOrEqual(BASE_DELAY_MS);
      expect(delay).toBeLessThanOrEqual(
        BASE_DELAY_MS + BASE_DELAY_MS * JITTER_FACTOR,
      );
    });

    it('should calculate increasing delays with backoff', () => {
      // Use fixed random to test
      jest.spyOn(Math, 'random').mockReturnValue(0);

      const delay0 = service.calculateDelay('email', 0); // 5000 * 2^0 = 5000
      const delay1 = service.calculateDelay('email', 1); // 5000 * 2^1 = 10000
      const delay2 = service.calculateDelay('email', 2); // 5000 * 2^2 = 20000
      const delay3 = service.calculateDelay('email', 3); // 5000 * 2^3 = 40000

      expect(delay0).toBe(5000);
      expect(delay1).toBe(10000);
      expect(delay2).toBe(20000);
      expect(delay3).toBe(40000);

      jest.restoreAllMocks();
    });

    it('should add jitter within expected range', () => {
      jest.spyOn(Math, 'random').mockReturnValue(1); // Max jitter

      const delay = service.calculateDelay('email', 1);
      // base = 5000 * 2^1 = 10000
      // jitter = 1.0 * 10000 * 0.2 = 2000
      // total = 12000
      expect(delay).toBe(12000);

      jest.restoreAllMocks();
    });

    it('should have zero jitter when random is 0', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);

      const delay = service.calculateDelay('email', 1);
      // base = 5000 * 2^1 = 10000, jitter = 0
      expect(delay).toBe(10000);

      jest.restoreAllMocks();
    });

    it('should produce different delays per channel due to randomness', () => {
      // Run multiple times to ensure randomness applies
      const delays = Array.from({ length: 10 }, () =>
        service.calculateDelay('email', 1),
      );

      // All should be between 10000 and 12000
      for (const delay of delays) {
        expect(delay).toBeGreaterThanOrEqual(10000);
        expect(delay).toBeLessThanOrEqual(12000);
      }
    });

    it('should round delay to integer', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.333);

      const delay = service.calculateDelay('email', 1);
      expect(Number.isInteger(delay)).toBe(true);

      jest.restoreAllMocks();
    });
  });

  describe('shouldRetry', () => {
    it('should return false for non-retryable errors', () => {
      const result = service.shouldRetry('email', 0, false);
      expect(result.shouldRetry).toBe(false);
      expect(result.reason).toContain('not retryable');
    });

    it('should return false when max retries exceeded for email', () => {
      const result = service.shouldRetry('email', RETRY_EMAIL_MAX, true);
      expect(result.shouldRetry).toBe(false);
      expect(result.reason).toContain('Max retries');
    });

    it('should return false when max retries exceeded for sms', () => {
      const result = service.shouldRetry('sms', RETRY_SMS_MAX, true);
      expect(result.shouldRetry).toBe(false);
    });

    it('should return false when max retries exceeded for whatsapp', () => {
      const result = service.shouldRetry('whatsapp', RETRY_WHATSAPP_MAX, true);
      expect(result.shouldRetry).toBe(false);
    });

    it('should return false when max retries exceeded for push', () => {
      const result = service.shouldRetry('push', RETRY_PUSH_MAX, true);
      expect(result.shouldRetry).toBe(false);
    });

    it('should return true with delay for retryable error within limit', () => {
      const result = service.shouldRetry('email', 0, true);
      expect(result.shouldRetry).toBe(true);
      expect(result.delay).toBeDefined();
      expect(result.delay).toBeGreaterThan(0);
      expect(result.reason).toContain('Retry 1/5');
    });

    it('should return true for last valid attempt', () => {
      const result = service.shouldRetry('email', RETRY_EMAIL_MAX - 1, true);
      expect(result.shouldRetry).toBe(true);
      expect(result.reason).toContain(
        `Retry ${RETRY_EMAIL_MAX}/${RETRY_EMAIL_MAX}`,
      );
    });

    it('should increment retry metric on retryable failure', () => {
      service.shouldRetry('email', 2, true);
      expect(metricsService.incrementRetry).toHaveBeenCalledWith(
        'email',
        'unknown',
        '3',
      );
    });

    it('should NOT increment retry metric for non-retryable', () => {
      service.shouldRetry('email', 0, false);
      expect(metricsService.incrementRetry).not.toHaveBeenCalled();
    });

    it('should NOT increment retry metric when max exceeded', () => {
      service.shouldRetry('email', RETRY_EMAIL_MAX, true);
      expect(metricsService.incrementRetry).not.toHaveBeenCalled();
    });

    it('should calculate increasing delays for successive attempts', () => {
      jest.spyOn(Math, 'random').mockReturnValue(0);

      const r0 = service.shouldRetry('email', 0, true);
      const r1 = service.shouldRetry('email', 1, true);
      const r2 = service.shouldRetry('email', 2, true);

      expect(r0.delay).toBeLessThan(r1.delay!);
      expect(r1.delay).toBeLessThan(r2.delay!);

      jest.restoreAllMocks();
    });
  });
});
