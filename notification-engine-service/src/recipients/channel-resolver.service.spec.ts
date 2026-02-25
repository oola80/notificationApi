import { Test, TestingModule } from '@nestjs/testing';
import { ChannelResolverService } from './channel-resolver.service.js';
import { PreferenceCacheService } from '../preferences/preference-cache.service.js';
import { OverrideCacheService } from '../overrides/override-cache.service.js';

describe('ChannelResolverService', () => {
  let service: ChannelResolverService;
  let preferenceCache: PreferenceCacheService;
  let overrideCache: OverrideCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelResolverService,
        {
          provide: PreferenceCacheService,
          useValue: {
            getPreferences: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: OverrideCacheService,
          useValue: {
            getOverrides: jest.fn().mockReturnValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<ChannelResolverService>(ChannelResolverService);
    preferenceCache = module.get<PreferenceCacheService>(
      PreferenceCacheService,
    );
    overrideCache = module.get<OverrideCacheService>(OverrideCacheService);
  });

  describe('no customer (null customerId)', () => {
    it('should return rule channels unfiltered', async () => {
      const result = await service.resolveChannels(
        ['email', 'sms'],
        null,
        'order.created',
      );
      expect(result).toEqual({
        effectiveChannels: ['email', 'sms'],
        filtered: false,
      });
    });

    it('should merge override channels with rule channels', async () => {
      jest.spyOn(overrideCache, 'getOverrides').mockReturnValue(['push']);
      const result = await service.resolveChannels(
        ['email'],
        null,
        'order.created',
      );
      expect(result.effectiveChannels).toContain('email');
      expect(result.effectiveChannels).toContain('push');
      expect(result.filtered).toBe(false);
    });

    it('should deduplicate channels', async () => {
      jest.spyOn(overrideCache, 'getOverrides').mockReturnValue(['email']);
      const result = await service.resolveChannels(
        ['email', 'sms'],
        null,
        'order.created',
      );
      expect(result.effectiveChannels).toEqual(['email', 'sms']);
    });
  });

  describe('customer with no preferences', () => {
    it('should return rule channels unfiltered', async () => {
      jest.spyOn(preferenceCache, 'getPreferences').mockResolvedValue([]);
      const result = await service.resolveChannels(
        ['email', 'sms'],
        'C001',
        'order.created',
      );
      expect(result).toEqual({
        effectiveChannels: ['email', 'sms'],
        filtered: false,
      });
    });
  });

  describe('customer with preferences', () => {
    it('should filter opted-out channels', async () => {
      jest
        .spyOn(preferenceCache, 'getPreferences')
        .mockResolvedValue([
          { customerId: 'C001', channel: 'sms', isOptedIn: false } as any,
        ]);
      const result = await service.resolveChannels(
        ['email', 'sms'],
        'C001',
        'order.created',
      );
      expect(result.effectiveChannels).toEqual(['email']);
      expect(result.filtered).toBe(true);
    });

    it('should keep opted-in channels', async () => {
      jest
        .spyOn(preferenceCache, 'getPreferences')
        .mockResolvedValue([
          { customerId: 'C001', channel: 'email', isOptedIn: true } as any,
        ]);
      const result = await service.resolveChannels(
        ['email', 'sms'],
        'C001',
        'order.created',
      );
      expect(result.effectiveChannels).toContain('email');
      expect(result.effectiveChannels).toContain('sms');
      expect(result.filtered).toBe(false);
    });

    it('should return all-channels-opted-out when everything filtered', async () => {
      jest
        .spyOn(preferenceCache, 'getPreferences')
        .mockResolvedValue([
          { customerId: 'C001', channel: 'email', isOptedIn: false } as any,
          { customerId: 'C001', channel: 'sms', isOptedIn: false } as any,
        ]);
      const result = await service.resolveChannels(
        ['email', 'sms'],
        'C001',
        'order.created',
      );
      expect(result).toEqual({
        effectiveChannels: [],
        filtered: true,
        reason: 'all-channels-opted-out',
      });
    });

    it('should force override channels even when opted out', async () => {
      jest
        .spyOn(preferenceCache, 'getPreferences')
        .mockResolvedValue([
          { customerId: 'C001', channel: 'email', isOptedIn: false } as any,
          { customerId: 'C001', channel: 'sms', isOptedIn: false } as any,
        ]);
      jest.spyOn(overrideCache, 'getOverrides').mockReturnValue(['email']);
      const result = await service.resolveChannels(
        ['email', 'sms'],
        'C001',
        'order.critical',
      );
      expect(result.effectiveChannels).toEqual(['email']);
      expect(result.filtered).toBe(true);
    });

    it('should handle mixed opted-in and opted-out with overrides', async () => {
      jest
        .spyOn(preferenceCache, 'getPreferences')
        .mockResolvedValue([
          { customerId: 'C001', channel: 'sms', isOptedIn: false } as any,
        ]);
      jest.spyOn(overrideCache, 'getOverrides').mockReturnValue(['push']);
      const result = await service.resolveChannels(
        ['email', 'sms'],
        'C001',
        'order.created',
      );
      expect(result.effectiveChannels).toContain('email');
      expect(result.effectiveChannels).toContain('push');
      expect(result.effectiveChannels).not.toContain('sms');
      expect(result.filtered).toBe(true);
    });
  });
});
