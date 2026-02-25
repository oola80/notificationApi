import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OverrideCacheService } from './override-cache.service.js';
import { CriticalChannelOverridesRepository } from './critical-channel-overrides.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';

const mockOverrides = [
  { id: '1', eventType: 'order.created', channel: 'email', isActive: true },
  { id: '2', eventType: 'order.created', channel: 'sms', isActive: true },
  { id: '3', eventType: 'payment.failed', channel: 'email', isActive: true },
];

describe('OverrideCacheService', () => {
  let cache: OverrideCacheService;
  let repository: CriticalChannelOverridesRepository;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OverrideCacheService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultValue?: any) => {
                if (key === 'app.overrideCacheEnabled') return true;
                return defaultValue;
              }),
          },
        },
        {
          provide: CriticalChannelOverridesRepository,
          useValue: {
            findAllActive: jest.fn().mockResolvedValue(mockOverrides),
            findActiveByEventType: jest.fn().mockResolvedValue([
              {
                id: '1',
                eventType: 'order.created',
                channel: 'email',
                isActive: true,
              },
            ]),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            setOverrideCacheSize: jest.fn(),
          },
        },
      ],
    }).compile();

    cache = module.get<OverrideCacheService>(OverrideCacheService);
    repository = module.get<CriticalChannelOverridesRepository>(
      CriticalChannelOverridesRepository,
    );
  });

  describe('onModuleInit', () => {
    it('should load all active overrides into cache', async () => {
      await cache.onModuleInit();
      expect(repository.findAllActive).toHaveBeenCalled();
      expect(cache.getOverrides('order.created')).toEqual(['email', 'sms']);
      expect(cache.getOverrides('payment.failed')).toEqual(['email']);
    });
  });

  describe('getOverrides', () => {
    it('should return empty array for unknown event type', () => {
      const result = cache.getOverrides('unknown.event');
      expect(result).toEqual([]);
    });

    it('should return cached channels after init', async () => {
      await cache.onModuleInit();
      const result = cache.getOverrides('order.created');
      expect(result).toEqual(['email', 'sms']);
    });
  });

  describe('refresh', () => {
    it('should reload all active overrides', async () => {
      await cache.onModuleInit();
      expect(cache.size).toBe(2);

      jest.spyOn(repository, 'findAllActive').mockResolvedValue([
        {
          id: '3',
          eventType: 'payment.failed',
          channel: 'push',
          isActive: true,
        } as any,
      ]);

      await cache.refresh();
      expect(cache.getOverrides('order.created')).toEqual([]);
      expect(cache.getOverrides('payment.failed')).toEqual(['push']);
      expect(cache.size).toBe(1);
    });
  });

  describe('invalidate', () => {
    it('should re-query single event type from DB', async () => {
      await cache.onModuleInit();
      await cache.invalidate('order.created');
      expect(repository.findActiveByEventType).toHaveBeenCalledWith(
        'order.created',
      );
      expect(cache.getOverrides('order.created')).toEqual(['email']);
    });

    it('should remove event type when no active overrides exist', async () => {
      await cache.onModuleInit();
      jest.spyOn(repository, 'findActiveByEventType').mockResolvedValue([]);
      await cache.invalidate('order.created');
      expect(cache.getOverrides('order.created')).toEqual([]);
    });
  });

  describe('disabled cache', () => {
    it('should return empty when cache is disabled', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OverrideCacheService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(false),
            },
          },
          {
            provide: CriticalChannelOverridesRepository,
            useValue: {
              findAllActive: jest.fn().mockResolvedValue(mockOverrides),
            },
          },
          {
            provide: MetricsService,
            useValue: {
              setOverrideCacheSize: jest.fn(),
            },
          },
        ],
      }).compile();

      const disabledCache =
        module.get<OverrideCacheService>(OverrideCacheService);
      expect(disabledCache.getOverrides('order.created')).toEqual([]);
    });
  });
});
