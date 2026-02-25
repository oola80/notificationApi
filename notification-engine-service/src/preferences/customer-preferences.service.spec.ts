import { Test, TestingModule } from '@nestjs/testing';
import { CustomerPreferencesService } from './customer-preferences.service.js';
import { CustomerPreferencesRepository } from './customer-preferences.repository.js';
import { PreferenceCacheService } from './preference-cache.service.js';
import { HttpException } from '@nestjs/common';

const mockPreference = {
  id: 1,
  customerId: 'C001',
  channel: 'email',
  isOptedIn: true,
  sourceSystem: 'crm',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CustomerPreferencesService', () => {
  let service: CustomerPreferencesService;
  let repository: CustomerPreferencesRepository;
  let cache: PreferenceCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerPreferencesService,
        {
          provide: CustomerPreferencesRepository,
          useValue: {
            upsertPreference: jest.fn().mockResolvedValue(mockPreference),
            bulkUpsert: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PreferenceCacheService,
          useValue: {
            evict: jest.fn(),
            getPreferences: jest.fn().mockResolvedValue([mockPreference]),
          },
        },
      ],
    }).compile();

    service = module.get<CustomerPreferencesService>(
      CustomerPreferencesService,
    );
    repository = module.get<CustomerPreferencesRepository>(
      CustomerPreferencesRepository,
    );
    cache = module.get<PreferenceCacheService>(PreferenceCacheService);
  });

  describe('upsert', () => {
    it('should upsert preference and evict cache', async () => {
      const dto = {
        customerId: 'C001',
        channel: 'email',
        isOptedIn: true,
        sourceSystem: 'crm',
      };
      const result = await service.upsert(dto);
      expect(repository.upsertPreference).toHaveBeenCalledWith(
        'C001',
        'email',
        true,
        'crm',
      );
      expect(cache.evict).toHaveBeenCalledWith('C001');
      expect(result).toEqual(mockPreference);
    });

    it('should pass undefined sourceSystem', async () => {
      const dto = { customerId: 'C001', channel: 'sms', isOptedIn: false };
      await service.upsert(dto);
      expect(repository.upsertPreference).toHaveBeenCalledWith(
        'C001',
        'sms',
        false,
        undefined,
      );
    });
  });

  describe('bulkUpsert', () => {
    it('should process bulk upsert and evict affected customers', async () => {
      const dto = {
        preferences: [
          { customerId: 'C001', channel: 'email', isOptedIn: true },
          { customerId: 'C002', channel: 'sms', isOptedIn: false },
          { customerId: 'C001', channel: 'sms', isOptedIn: true },
        ],
      };
      const result = await service.bulkUpsert(dto);
      expect(repository.bulkUpsert).toHaveBeenCalled();
      expect(cache.evict).toHaveBeenCalledWith('C001');
      expect(cache.evict).toHaveBeenCalledWith('C002');
      expect(result).toEqual({ processed: 3 });
    });

    it('should throw NES-012 when exceeding 1000 records', async () => {
      const prefs = Array.from({ length: 1001 }, (_, i) => ({
        customerId: `C${i}`,
        channel: 'email',
        isOptedIn: true,
      }));
      try {
        await service.bulkUpsert({ preferences: prefs });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getResponse()).toEqual(
          expect.objectContaining({ code: 'NES-012' }),
        );
      }
    });

    it('should deduplicate customer IDs for cache eviction', async () => {
      const dto = {
        preferences: [
          { customerId: 'C001', channel: 'email', isOptedIn: true },
          { customerId: 'C001', channel: 'sms', isOptedIn: false },
        ],
      };
      await service.bulkUpsert(dto);
      // evict should be called once for C001, not twice
      const evictCalls = (cache.evict as jest.Mock).mock.calls.filter(
        (c: any[]) => c[0] === 'C001',
      );
      expect(evictCalls).toHaveLength(1);
    });
  });

  describe('getPreferences', () => {
    it('should delegate to cache', async () => {
      const result = await service.getPreferences('C001');
      expect(cache.getPreferences).toHaveBeenCalledWith('C001');
      expect(result).toEqual([mockPreference]);
    });
  });
});
