import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PreferenceCacheService } from './preference-cache.service.js';
import { CustomerPreferencesRepository } from './customer-preferences.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';

const mockPreference = {
  id: 1,
  customerId: 'C001',
  channel: 'email',
  isOptedIn: true,
  sourceSystem: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PreferenceCacheService', () => {
  let cache: PreferenceCacheService;
  let repository: CustomerPreferencesRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferenceCacheService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultValue?: any) => {
                const config: Record<string, any> = {
                  'app.prefCacheEnabled': true,
                  'app.prefCacheTtlSeconds': 300,
                  'app.prefCacheMaxSize': 5,
                };
                return config[key] ?? defaultValue;
              }),
          },
        },
        {
          provide: CustomerPreferencesRepository,
          useValue: {
            findByCustomerId: jest.fn().mockResolvedValue([mockPreference]),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            setPreferenceCacheSize: jest.fn(),
          },
        },
      ],
    }).compile();

    cache = module.get<PreferenceCacheService>(PreferenceCacheService);
    repository = module.get<CustomerPreferencesRepository>(
      CustomerPreferencesRepository,
    );
  });

  describe('getPreferences', () => {
    it('should query repository on cache miss', async () => {
      const result = await cache.getPreferences('C001');
      expect(repository.findByCustomerId).toHaveBeenCalledWith('C001');
      expect(result).toEqual([mockPreference]);
    });

    it('should return cached value on cache hit', async () => {
      await cache.getPreferences('C001');
      await cache.getPreferences('C001');
      expect(repository.findByCustomerId).toHaveBeenCalledTimes(1);
    });

    it('should re-query after TTL expiry', async () => {
      // First call - populates cache
      await cache.getPreferences('C001');
      expect(repository.findByCustomerId).toHaveBeenCalledTimes(1);

      // Simulate TTL expiry by manipulating the internal cache entry
      const cacheInternal = (cache as any).cache as Map<string, any>;
      const entry = cacheInternal.get('C001');
      entry.expiresAt = Date.now() - 1000;

      // Second call - should re-query
      await cache.getPreferences('C001');
      expect(repository.findByCustomerId).toHaveBeenCalledTimes(2);
    });
  });

  describe('evict', () => {
    it('should remove entry from cache', async () => {
      await cache.getPreferences('C001');
      expect(cache.size).toBe(1);
      cache.evict('C001');
      expect(cache.size).toBe(0);
    });

    it('should handle evicting non-existent key', () => {
      expect(() => cache.evict('nonexistent')).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear entire cache', async () => {
      await cache.getPreferences('C001');
      await cache.getPreferences('C002');
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entries when exceeding maxSize', async () => {
      // maxSize is 5 in test config
      for (let i = 0; i < 6; i++) {
        jest
          .spyOn(repository, 'findByCustomerId')
          .mockResolvedValue([
            { ...mockPreference, customerId: `C${i}` } as any,
          ]);
        await cache.getPreferences(`C${i}`);
      }
      // C0 should have been evicted
      expect(cache.size).toBe(5);
    });
  });
});
