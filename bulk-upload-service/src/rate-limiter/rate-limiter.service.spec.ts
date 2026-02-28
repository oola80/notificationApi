import { ConfigService } from '@nestjs/config';
import { RateLimiterService } from './rate-limiter.service.js';

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let configService: jest.Mocked<ConfigService>;

  const DEFAULT_CAPACITY = 50;

  beforeEach(() => {
    jest.useFakeTimers();

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'app.workerRateLimit': DEFAULT_CAPACITY,
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    service = new RateLimiterService(configService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should initialize tokens equal to capacity', () => {
      const tokens = service.getAvailableTokens();
      expect(tokens).toBe(DEFAULT_CAPACITY);
    });

    it('should read capacity from config', () => {
      expect(configService.get).toHaveBeenCalledWith(
        'app.workerRateLimit',
        50,
      );
    });

    it('should use custom capacity from config', () => {
      const customConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'app.workerRateLimit': 10,
          };
          return config[key] ?? defaultValue;
        }),
      } as any;

      const customService = new RateLimiterService(customConfigService);
      expect(customService.getAvailableTokens()).toBe(10);
    });

    it('should fall back to default capacity of 50 when config key is missing', () => {
      const emptyConfigService = {
        get: jest
          .fn()
          .mockImplementation((_key: string, defaultValue?: any) => {
            return defaultValue;
          }),
      } as any;

      const fallbackService = new RateLimiterService(emptyConfigService);
      expect(fallbackService.getAvailableTokens()).toBe(50);
    });
  });

  describe('tryAcquire', () => {
    it('should return true when tokens are available', () => {
      const result = service.tryAcquire();
      expect(result).toBe(true);
    });

    it('should decrement available tokens on success', () => {
      service.tryAcquire();
      expect(service.getAvailableTokens()).toBe(DEFAULT_CAPACITY - 1);
    });

    it('should return false when no tokens are available', () => {
      // Drain all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }

      const result = service.tryAcquire();
      expect(result).toBe(false);
    });

    it('should drain tokens with multiple rapid calls', () => {
      let acquired = 0;
      for (let i = 0; i < DEFAULT_CAPACITY + 5; i++) {
        if (service.tryAcquire()) {
          acquired++;
        }
      }

      expect(acquired).toBe(DEFAULT_CAPACITY);
      expect(service.getAvailableTokens()).toBe(0);
    });

    it('should succeed again after tokens refill', () => {
      // Drain all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }
      expect(service.tryAcquire()).toBe(false);

      // Advance time by 1 second — should fully refill (refillRate = capacity)
      jest.advanceTimersByTime(1000);

      expect(service.tryAcquire()).toBe(true);
    });
  });

  describe('acquire', () => {
    it('should return 0 when tokens are available (no wait)', async () => {
      const waitTime = await service.acquire();
      expect(waitTime).toBe(0);
    });

    it('should decrement tokens when acquired immediately', async () => {
      await service.acquire();
      expect(service.getAvailableTokens()).toBe(DEFAULT_CAPACITY - 1);
    });

    it('should return positive wait time when no tokens available', async () => {
      // Drain all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }

      // Start acquire which will need to wait
      const acquirePromise = service.acquire();

      // Advance timers to allow the sleep to resolve
      jest.advanceTimersByTime(100);

      const waitTime = await acquirePromise;
      expect(waitTime).toBeGreaterThan(0);
    });

    it('should consume a token after waiting', async () => {
      // Drain all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }

      const acquirePromise = service.acquire();
      jest.advanceTimersByTime(1000);
      await acquirePromise;

      // After acquire resolves, one token was consumed from the refilled pool
      // Tokens refilled during the wait, then one was consumed
      const available = service.getAvailableTokens();
      expect(available).toBeLessThan(DEFAULT_CAPACITY);
    });

    it('should return wait time in seconds', async () => {
      // Drain all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }

      const acquirePromise = service.acquire();
      jest.advanceTimersByTime(1000);
      const waitTime = await acquirePromise;

      // Wait time should be a small fractional second (1/refillRate)
      expect(waitTime).toBeGreaterThan(0);
      expect(waitTime).toBeLessThanOrEqual(1);
    });
  });

  describe('getAvailableTokens', () => {
    it('should return full capacity initially', () => {
      expect(service.getAvailableTokens()).toBe(DEFAULT_CAPACITY);
    });

    it('should reflect consumption', () => {
      service.tryAcquire();
      service.tryAcquire();
      service.tryAcquire();
      expect(service.getAvailableTokens()).toBe(DEFAULT_CAPACITY - 3);
    });

    it('should return 0 when fully drained', () => {
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }
      expect(service.getAvailableTokens()).toBe(0);
    });

    it('should return floored value', () => {
      // Drain all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }

      // Advance a small amount of time to get fractional tokens
      jest.advanceTimersByTime(10); // 10ms -> 0.5 tokens (refillRate=50/s)

      const tokens = service.getAvailableTokens();
      expect(tokens).toBe(Math.floor(tokens));
      expect(Number.isInteger(tokens)).toBe(true);
    });
  });

  describe('token refill', () => {
    it('should refill tokens over time', () => {
      // Drain all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }
      expect(service.getAvailableTokens()).toBe(0);

      // Advance 500ms — half a second at rate of 50/s = 25 tokens
      jest.advanceTimersByTime(500);

      expect(service.getAvailableTokens()).toBe(25);
    });

    it('should not exceed capacity', () => {
      // Start at full capacity, advance time significantly
      jest.advanceTimersByTime(10000);

      expect(service.getAvailableTokens()).toBe(DEFAULT_CAPACITY);
    });

    it('should not exceed capacity after drain and long refill', () => {
      // Drain half the tokens
      for (let i = 0; i < 10; i++) {
        service.tryAcquire();
      }

      // Advance 10 seconds — more than enough to fully refill
      jest.advanceTimersByTime(10000);

      expect(service.getAvailableTokens()).toBe(DEFAULT_CAPACITY);
    });

    it('should refill proportionally to elapsed time', () => {
      // Drain all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }

      // Advance 100ms — should add 5 tokens (50/s * 0.1s = 5)
      jest.advanceTimersByTime(100);
      expect(service.getAvailableTokens()).toBe(5);

      // Advance another 100ms — 5 more tokens
      jest.advanceTimersByTime(100);
      expect(service.getAvailableTokens()).toBe(10);
    });

    it('should fully refill after one full second', () => {
      // Drain all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }
      expect(service.getAvailableTokens()).toBe(0);

      // Advance exactly 1 second
      jest.advanceTimersByTime(1000);

      expect(service.getAvailableTokens()).toBe(DEFAULT_CAPACITY);
    });
  });

  describe('burst handling', () => {
    it('should allow burst up to capacity', () => {
      let consumed = 0;
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        if (service.tryAcquire()) {
          consumed++;
        }
      }
      expect(consumed).toBe(DEFAULT_CAPACITY);
    });

    it('should reject requests beyond capacity in a burst', () => {
      // Consume all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }

      // Next attempts should fail
      expect(service.tryAcquire()).toBe(false);
      expect(service.tryAcquire()).toBe(false);
      expect(service.tryAcquire()).toBe(false);
    });

    it('should sustain throughput when consuming and refilling', () => {
      // Drain all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }
      expect(service.tryAcquire()).toBe(false);

      // Wait for partial refill (200ms = 10 tokens at 50/s)
      jest.advanceTimersByTime(200);

      let secondBurst = 0;
      for (let i = 0; i < 20; i++) {
        if (service.tryAcquire()) {
          secondBurst++;
        }
      }
      expect(secondBurst).toBe(10);
    });

    it('should handle rapid acquire-refill-acquire cycles', () => {
      // First burst: drain 10 tokens
      for (let i = 0; i < 10; i++) {
        service.tryAcquire();
      }
      expect(service.getAvailableTokens()).toBe(40);

      // Refill for 200ms (adds 10 tokens)
      jest.advanceTimersByTime(200);
      expect(service.getAvailableTokens()).toBe(DEFAULT_CAPACITY); // capped at capacity

      // Second burst: drain 20 tokens
      for (let i = 0; i < 20; i++) {
        service.tryAcquire();
      }
      expect(service.getAvailableTokens()).toBe(30);
    });
  });

  describe('custom capacity', () => {
    it('should work correctly with small capacity', () => {
      const smallConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'app.workerRateLimit': 3,
          };
          return config[key] ?? defaultValue;
        }),
      } as any;

      const smallService = new RateLimiterService(smallConfigService);

      expect(smallService.getAvailableTokens()).toBe(3);
      expect(smallService.tryAcquire()).toBe(true);
      expect(smallService.tryAcquire()).toBe(true);
      expect(smallService.tryAcquire()).toBe(true);
      expect(smallService.tryAcquire()).toBe(false);
    });

    it('should work correctly with large capacity', () => {
      const largeConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'app.workerRateLimit': 1000,
          };
          return config[key] ?? defaultValue;
        }),
      } as any;

      const largeService = new RateLimiterService(largeConfigService);

      expect(largeService.getAvailableTokens()).toBe(1000);

      // Consume 500
      for (let i = 0; i < 500; i++) {
        largeService.tryAcquire();
      }
      expect(largeService.getAvailableTokens()).toBe(500);
    });

    it('should set refillRate equal to capacity', () => {
      const customConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'app.workerRateLimit': 20,
          };
          return config[key] ?? defaultValue;
        }),
      } as any;

      const customService = new RateLimiterService(customConfigService);

      // Drain all 20 tokens
      for (let i = 0; i < 20; i++) {
        customService.tryAcquire();
      }
      expect(customService.getAvailableTokens()).toBe(0);

      // After 500ms, should refill 10 tokens (refillRate=20, 0.5s*20=10)
      jest.advanceTimersByTime(500);
      expect(customService.getAvailableTokens()).toBe(10);

      // After another 500ms, should be full again
      jest.advanceTimersByTime(500);
      expect(customService.getAvailableTokens()).toBe(20);
    });
  });

  describe('concurrent acquire calls', () => {
    it('should handle multiple sequential acquire calls', async () => {
      const wait1 = await service.acquire();
      const wait2 = await service.acquire();
      const wait3 = await service.acquire();

      expect(wait1).toBe(0);
      expect(wait2).toBe(0);
      expect(wait3).toBe(0);
      expect(service.getAvailableTokens()).toBe(DEFAULT_CAPACITY - 3);
    });

    it('should handle acquire after partial drain', async () => {
      // Drain most tokens via tryAcquire
      for (let i = 0; i < DEFAULT_CAPACITY - 2; i++) {
        service.tryAcquire();
      }

      // These two should succeed immediately
      const wait1 = await service.acquire();
      const wait2 = await service.acquire();

      expect(wait1).toBe(0);
      expect(wait2).toBe(0);
      expect(service.getAvailableTokens()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle capacity of 1', () => {
      const singleConfigService = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'app.workerRateLimit': 1,
          };
          return config[key] ?? defaultValue;
        }),
      } as any;

      const singleService = new RateLimiterService(singleConfigService);

      expect(singleService.getAvailableTokens()).toBe(1);
      expect(singleService.tryAcquire()).toBe(true);
      expect(singleService.tryAcquire()).toBe(false);

      // After 1 second, should have 1 token again
      jest.advanceTimersByTime(1000);
      expect(singleService.getAvailableTokens()).toBe(1);
    });

    it('should handle no time elapsed between calls', () => {
      const initial = service.getAvailableTokens();
      const again = service.getAvailableTokens();
      expect(initial).toBe(again);
    });

    it('should handle very small time advances', () => {
      // Drain all tokens
      for (let i = 0; i < DEFAULT_CAPACITY; i++) {
        service.tryAcquire();
      }

      // Advance 1ms — should add 0.05 tokens at rate 50/s, floored to 0
      jest.advanceTimersByTime(1);
      expect(service.getAvailableTokens()).toBe(0);
    });
  });
});
