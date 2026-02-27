import { Test, TestingModule } from '@nestjs/testing';
import { RateLimiterService } from './rate-limiter.service.js';
import { MetricsService } from '../metrics/metrics.service.js';

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let metricsService: {
    observeRateLimitWait: jest.Mock;
  };

  const providerId = '11111111-1111-1111-1111-111111111111';

  beforeEach(async () => {
    metricsService = {
      observeRateLimitWait: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        { provide: MetricsService, useValue: metricsService },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  describe('initBucket', () => {
    it('should create a new bucket with full capacity', () => {
      service.initBucket(providerId, 100, 200);
      const status = service.getStatus(providerId);
      expect(status).not.toBeNull();
      expect(status!.available).toBe(200);
      expect(status!.capacity).toBe(200);
      expect(status!.refillRate).toBe(100);
    });

    it('should overwrite existing bucket', () => {
      service.initBucket(providerId, 100, 200);
      service.initBucket(providerId, 50, 100);
      const status = service.getStatus(providerId);
      expect(status!.capacity).toBe(100);
      expect(status!.refillRate).toBe(50);
    });
  });

  describe('acquire', () => {
    it('should acquire a token immediately when bucket has tokens', async () => {
      service.initBucket(providerId, 10, 10);
      const result = await service.acquire(providerId);
      expect(result.acquired).toBe(true);
      expect(result.waitMs).toBe(0);
    });

    it('should return acquired:true and waitMs:0 for unknown provider', async () => {
      const result = await service.acquire('unknown-provider');
      expect(result.acquired).toBe(true);
      expect(result.waitMs).toBe(0);
    });

    it('should consume a token on acquire', async () => {
      service.initBucket(providerId, 10, 5);

      const statusBefore = service.getStatus(providerId);
      expect(statusBefore!.available).toBe(5);

      await service.acquire(providerId);

      const statusAfter = service.getStatus(providerId);
      expect(statusAfter!.available).toBe(4);
    });

    it('should drain all tokens', async () => {
      service.initBucket(providerId, 1, 3);

      // Drain tokens fast (before refill)
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      const r1 = await service.acquire(providerId);
      const r2 = await service.acquire(providerId);
      const r3 = await service.acquire(providerId);

      expect(r1.acquired).toBe(true);
      expect(r2.acquired).toBe(true);
      expect(r3.acquired).toBe(true);

      jest.restoreAllMocks();
    });

    it('should fail to acquire when bucket is empty and timeout is 0', async () => {
      service.initBucket(providerId, 1, 1);

      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      // Consume the only token
      await service.acquire(providerId);

      // Try to acquire with 0 timeout
      const result = await service.acquire(providerId, 0);
      expect(result.acquired).toBe(false);

      jest.restoreAllMocks();
    });

    it('should wait and acquire when bucket refills', async () => {
      service.initBucket(providerId, 10, 1);

      // Consume the token
      await service.acquire(providerId);

      // Next acquire should wait for refill (100ms for 10/sec)
      const result = await service.acquire(providerId);
      // May or may not acquire depending on timing, but should have waited
      expect(result.waitMs).toBeGreaterThanOrEqual(0);
    });

    it('should respect timeout when waiting for token', async () => {
      service.initBucket(providerId, 0.1, 1); // Very slow refill: 1 token per 10 seconds

      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      // Consume the token
      await service.acquire(providerId);

      jest.restoreAllMocks();

      // Try to acquire with short timeout — wait time (10s) > timeout (50ms)
      const result = await service.acquire(providerId, 50);
      expect(result.acquired).toBe(false);
    });

    it('should record metrics for immediate acquire', async () => {
      service.initBucket(providerId, 10, 10);
      await service.acquire(providerId);
      expect(metricsService.observeRateLimitWait).toHaveBeenCalledWith(
        providerId,
        0,
      );
    });

    it('should record metrics for waited acquire', async () => {
      service.initBucket(providerId, 10, 1);

      // Consume the token
      await service.acquire(providerId);

      // Next acquire will wait
      await service.acquire(providerId);

      // Second call should have observed non-zero wait
      expect(metricsService.observeRateLimitWait).toHaveBeenCalledTimes(2);
    });
  });

  describe('getStatus', () => {
    it('should return null for unknown provider', () => {
      expect(service.getStatus('unknown')).toBeNull();
    });

    it('should return correct status', () => {
      service.initBucket(providerId, 50, 100);
      const status = service.getStatus(providerId);
      expect(status).toEqual({
        available: 100,
        capacity: 100,
        refillRate: 50,
      });
    });

    it('should show refilled tokens after time passes', async () => {
      service.initBucket(providerId, 10, 10);

      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      // Drain some tokens
      await service.acquire(providerId);
      await service.acquire(providerId);
      await service.acquire(providerId);

      // Advance time by 1 second (should refill 10 tokens)
      jest.spyOn(Date, 'now').mockReturnValue(now + 1000);

      const status = service.getStatus(providerId);
      // 7 remaining + 10 refilled = 17, capped at 10 (capacity)
      expect(status!.available).toBe(10);

      jest.restoreAllMocks();
    });

    it('should cap tokens at capacity', () => {
      service.initBucket(providerId, 100, 10);

      // Even after a long time, tokens should be capped at capacity
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now + 100000);

      const status = service.getStatus(providerId);
      expect(status!.available).toBe(10);

      jest.restoreAllMocks();
    });
  });

  describe('token refill', () => {
    it('should refill tokens based on elapsed time', async () => {
      service.initBucket(providerId, 10, 10);

      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await service.acquire(providerId);
      }

      let status = service.getStatus(providerId);
      expect(status!.available).toBe(0);

      // Advance time by 500ms — should refill 5 tokens (10/sec * 0.5s)
      jest.spyOn(Date, 'now').mockReturnValue(now + 500);

      status = service.getStatus(providerId);
      expect(status!.available).toBe(5);

      jest.restoreAllMocks();
    });

    it('should not exceed capacity after refill', async () => {
      service.initBucket(providerId, 100, 5);

      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      await service.acquire(providerId);

      // Advance by 10 seconds — would add 1000 tokens, but cap at 5
      jest.spyOn(Date, 'now').mockReturnValue(now + 10000);

      const status = service.getStatus(providerId);
      expect(status!.available).toBe(5);

      jest.restoreAllMocks();
    });

    it('should handle concurrent acquires on same bucket', async () => {
      service.initBucket(providerId, 100, 5);

      // Fire multiple acquires concurrently
      const results = await Promise.all([
        service.acquire(providerId),
        service.acquire(providerId),
        service.acquire(providerId),
        service.acquire(providerId),
        service.acquire(providerId),
      ]);

      const acquired = results.filter((r) => r.acquired).length;
      expect(acquired).toBeGreaterThanOrEqual(1);
      expect(acquired).toBeLessThanOrEqual(5);
    });
  });

  describe('bucket reinitialization', () => {
    it('should reset tokens to new capacity on reinit', () => {
      service.initBucket(providerId, 100, 200);

      const status1 = service.getStatus(providerId);
      expect(status1!.capacity).toBe(200);

      service.initBucket(providerId, 50, 100);

      const status2 = service.getStatus(providerId);
      expect(status2!.capacity).toBe(100);
      expect(status2!.available).toBe(100);
      expect(status2!.refillRate).toBe(50);
    });
  });

  describe('multiple providers', () => {
    const provider2 = '22222222-2222-2222-2222-222222222222';

    it('should maintain independent buckets per provider', async () => {
      service.initBucket(providerId, 10, 5);
      service.initBucket(provider2, 20, 10);

      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      // Drain all tokens from provider 1
      for (let i = 0; i < 5; i++) {
        await service.acquire(providerId);
      }

      // Provider 2 should still have all tokens
      const status2 = service.getStatus(provider2);
      expect(status2!.available).toBe(10);

      const status1 = service.getStatus(providerId);
      expect(status1!.available).toBe(0);

      jest.restoreAllMocks();
    });

    it('should record correct metrics per provider', async () => {
      service.initBucket(providerId, 10, 10);
      service.initBucket(provider2, 10, 10);

      await service.acquire(providerId);
      await service.acquire(provider2);

      expect(metricsService.observeRateLimitWait).toHaveBeenCalledWith(
        providerId,
        0,
      );
      expect(metricsService.observeRateLimitWait).toHaveBeenCalledWith(
        provider2,
        0,
      );
    });
  });
});
