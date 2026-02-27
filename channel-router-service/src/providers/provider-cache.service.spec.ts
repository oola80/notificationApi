import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ProviderCacheService } from './provider-cache.service.js';
import { ProviderConfigsRepository } from './provider-configs.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { ProviderConfig } from './entities/provider-config.entity.js';

describe('ProviderCacheService', () => {
  let service: ProviderCacheService;
  let repository: { findActiveByChannel: jest.Mock };
  let configGet: jest.Mock;

  const mockProviders: Partial<ProviderConfig>[] = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      providerName: 'SendGrid',
      providerId: 'sendgrid',
      channel: 'email',
      adapterUrl: 'http://adapter-sendgrid:3170',
      isActive: true,
      routingWeight: 100,
      circuitBreakerState: 'CLOSED',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      providerName: 'Twilio',
      providerId: 'twilio-sms',
      channel: 'sms',
      adapterUrl: 'http://adapter-twilio:3173',
      isActive: true,
      routingWeight: 100,
      circuitBreakerState: 'CLOSED',
    },
  ];

  beforeEach(async () => {
    repository = {
      findActiveByChannel: jest.fn().mockImplementation((channel: string) => {
        return Promise.resolve(
          mockProviders.filter((p) => p.channel === channel),
        );
      }),
    };

    configGet = jest
      .fn()
      .mockImplementation((key: string, defaultValue?: any) => {
        const map: Record<string, any> = {
          'app.providerCacheEnabled': true,
          'app.providerCacheTtlSeconds': 300,
        };
        return map[key] ?? defaultValue;
      });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProviderCacheService,
        { provide: ProviderConfigsRepository, useValue: repository },
        { provide: ConfigService, useValue: { get: configGet } },
        {
          provide: MetricsService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<ProviderCacheService>(ProviderCacheService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('onModuleInit', () => {
    it('should load cache on init when enabled', async () => {
      await service.onModuleInit();

      expect(repository.findActiveByChannel).toHaveBeenCalledTimes(4);
      expect(service.getCacheSize()).toBe(2);
      expect(service.getLastRefreshedAt()).toBeGreaterThan(0);
    });

    it('should skip loading when disabled', async () => {
      configGet.mockImplementation((key: string) => {
        if (key === 'app.providerCacheEnabled') return false;
        return 300;
      });

      const module = await Test.createTestingModule({
        providers: [
          ProviderCacheService,
          { provide: ProviderConfigsRepository, useValue: repository },
          { provide: ConfigService, useValue: { get: configGet } },
          { provide: MetricsService, useValue: {} },
        ],
      }).compile();

      const disabledService =
        module.get<ProviderCacheService>(ProviderCacheService);
      await disabledService.onModuleInit();

      expect(repository.findActiveByChannel).not.toHaveBeenCalled();
      expect(disabledService.isEnabled()).toBe(false);
    });
  });

  describe('getActiveProvidersByChannel', () => {
    it('should return cached providers for a channel', async () => {
      await service.onModuleInit();

      const emailProviders = service.getActiveProvidersByChannel('email');
      expect(emailProviders).toHaveLength(1);
      expect(emailProviders[0].providerId).toBe('sendgrid');
    });

    it('should return empty array for channel with no providers', async () => {
      await service.onModuleInit();

      const pushProviders = service.getActiveProvidersByChannel('push');
      expect(pushProviders).toHaveLength(0);
    });

    it('should return empty array when disabled', async () => {
      configGet.mockImplementation((key: string) => {
        if (key === 'app.providerCacheEnabled') return false;
        return 300;
      });

      const module = await Test.createTestingModule({
        providers: [
          ProviderCacheService,
          { provide: ProviderConfigsRepository, useValue: repository },
          { provide: ConfigService, useValue: { get: configGet } },
          { provide: MetricsService, useValue: {} },
        ],
      }).compile();

      const disabledService =
        module.get<ProviderCacheService>(ProviderCacheService);
      const result = disabledService.getActiveProvidersByChannel('email');
      expect(result).toHaveLength(0);
    });
  });

  describe('invalidate', () => {
    it('should reload cache on invalidation', async () => {
      await service.onModuleInit();
      expect(repository.findActiveByChannel).toHaveBeenCalledTimes(4);

      await service.invalidate();
      expect(repository.findActiveByChannel).toHaveBeenCalledTimes(8);
    });

    it('should do nothing when disabled', async () => {
      configGet.mockImplementation((key: string) => {
        if (key === 'app.providerCacheEnabled') return false;
        return 300;
      });

      const module = await Test.createTestingModule({
        providers: [
          ProviderCacheService,
          { provide: ProviderConfigsRepository, useValue: repository },
          { provide: ConfigService, useValue: { get: configGet } },
          { provide: MetricsService, useValue: {} },
        ],
      }).compile();

      const disabledService =
        module.get<ProviderCacheService>(ProviderCacheService);
      await disabledService.invalidate();

      expect(repository.findActiveByChannel).not.toHaveBeenCalled();
    });
  });

  describe('getCacheSize', () => {
    it('should return total count of cached providers', async () => {
      await service.onModuleInit();
      expect(service.getCacheSize()).toBe(2);
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });
});
