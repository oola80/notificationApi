import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MappingCacheService } from './mapping-cache.service.js';
import { EventMappingsRepository } from '../event-mappings/event-mappings.repository.js';
import { EventMapping } from '../event-mappings/entities/event-mapping.entity.js';

describe('MappingCacheService', () => {
  let service: MappingCacheService;
  let repository: jest.Mocked<EventMappingsRepository>;

  const mockMapping: EventMapping = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    sourceId: 'shopify',
    eventType: 'order.created',
    name: 'Shopify Order Created',
    description: null,
    fieldMappings: { orderId: { source: 'id', target: 'orderId' } },
    eventTypeMapping: null,
    timestampField: null,
    timestampFormat: 'iso8601',
    sourceEventIdField: null,
    validationSchema: null,
    priority: 'normal',
    isActive: true,
    version: 1,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const wildcardMapping: EventMapping = {
    ...mockMapping,
    id: '660e8400-e29b-41d4-a716-446655440000',
    eventType: '*',
    name: 'Shopify Wildcard',
    version: 1,
  };

  const createModule = async (cacheEnabled: boolean) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MappingCacheService,
        {
          provide: EventMappingsRepository,
          useValue: {
            findAllActive: jest.fn(),
            findBySourceAndType: jest.fn(),
            findById: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'app.mappingCacheEnabled') return cacheEnabled;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MappingCacheService>(MappingCacheService);
    repository = module.get(EventMappingsRepository);
    return module;
  };

  describe('when cache is disabled', () => {
    beforeEach(async () => {
      await createModule(false);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should set ready=true immediately on init', async () => {
      await service.onModuleInit();
      expect(service.getCacheStats().ready).toBe(true);
      expect(service.getCacheStats().enabled).toBe(false);
    });

    it('should not call findAllActive on init', async () => {
      await service.onModuleInit();
      expect(repository.findAllActive).not.toHaveBeenCalled();
    });

    it('should fall through to direct DB lookup on getMapping', async () => {
      await service.onModuleInit();
      repository.findBySourceAndType.mockResolvedValue(mockMapping);

      const result = await service.getMapping('shopify', 'order.created');

      expect(result).toEqual(mockMapping);
      expect(repository.findBySourceAndType).toHaveBeenCalledWith(
        'shopify',
        'order.created',
      );
    });

    it('should try wildcard when exact match not found (disabled mode)', async () => {
      await service.onModuleInit();
      repository.findBySourceAndType
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(wildcardMapping);

      const result = await service.getMapping('shopify', 'order.updated');

      expect(result).toEqual(wildcardMapping);
      expect(repository.findBySourceAndType).toHaveBeenCalledTimes(2);
      expect(repository.findBySourceAndType).toHaveBeenCalledWith(
        'shopify',
        '*',
      );
    });

    it('should return null when no mapping found (disabled mode)', async () => {
      await service.onModuleInit();
      repository.findBySourceAndType.mockResolvedValue(null);

      const result = await service.getMapping('shopify', 'order.unknown');

      expect(result).toBeNull();
    });
  });

  describe('when cache is enabled', () => {
    beforeEach(async () => {
      await createModule(true);
    });

    it('should warm up cache on init', async () => {
      repository.findAllActive.mockResolvedValue([mockMapping]);

      await service.onModuleInit();

      expect(repository.findAllActive).toHaveBeenCalled();
      expect(service.getCacheStats().size).toBe(1);
      expect(service.getCacheStats().ready).toBe(true);
    });

    it('should throw EIS-021 when cache is not ready', async () => {
      // Do not call onModuleInit — cache not ready
      try {
        await service.getMapping('shopify', 'order.created');
        fail('Should have thrown');
      } catch (error: any) {
        const response = error.getResponse();
        expect(response.code).toBe('EIS-021');
      }
    });

    it('should return cached mapping on exact key hit', async () => {
      repository.findAllActive.mockResolvedValue([mockMapping]);
      await service.onModuleInit();

      const result = await service.getMapping('shopify', 'order.created');

      expect(result).toEqual(mockMapping);
      // No DB call after init
      expect(repository.findBySourceAndType).not.toHaveBeenCalled();
    });

    it('should return cached wildcard mapping on wildcard key hit', async () => {
      repository.findAllActive.mockResolvedValue([wildcardMapping]);
      await service.onModuleInit();

      const result = await service.getMapping('shopify', 'order.updated');

      expect(result).toEqual(wildcardMapping);
      expect(repository.findBySourceAndType).not.toHaveBeenCalled();
    });

    it('should fetch from DB on cache miss and populate cache', async () => {
      repository.findAllActive.mockResolvedValue([]);
      await service.onModuleInit();

      repository.findBySourceAndType.mockResolvedValue(mockMapping);

      const result = await service.getMapping('shopify', 'order.created');

      expect(result).toEqual(mockMapping);
      expect(repository.findBySourceAndType).toHaveBeenCalledWith(
        'shopify',
        'order.created',
      );
      expect(service.getCacheStats().size).toBe(1);

      // Second call should use cache
      repository.findBySourceAndType.mockClear();
      const result2 = await service.getMapping('shopify', 'order.created');
      expect(result2).toEqual(mockMapping);
      expect(repository.findBySourceAndType).not.toHaveBeenCalled();
    });

    it('should return null on cache miss when DB has no mapping', async () => {
      repository.findAllActive.mockResolvedValue([]);
      await service.onModuleInit();

      repository.findBySourceAndType.mockResolvedValue(null);

      const result = await service.getMapping('shopify', 'order.unknown');

      expect(result).toBeNull();
    });

    it('should deduplicate concurrent fetches for the same key (single-flight)', async () => {
      repository.findAllActive.mockResolvedValue([]);
      await service.onModuleInit();

      let resolvePromise: (value: EventMapping | null) => void;
      const delayedPromise = new Promise<EventMapping | null>((resolve) => {
        resolvePromise = resolve;
      });
      repository.findBySourceAndType.mockReturnValue(delayedPromise);

      // Fire two concurrent requests for the same key
      const promise1 = service.getMapping('shopify', 'order.created');
      const promise2 = service.getMapping('shopify', 'order.created');

      resolvePromise!(mockMapping);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual(mockMapping);
      expect(result2).toEqual(mockMapping);
      // Should only have called DB once (exact match call)
      expect(repository.findBySourceAndType).toHaveBeenCalledTimes(1);
    });
  });

  describe('invalidateMapping', () => {
    beforeEach(async () => {
      await createModule(true);
      repository.findAllActive.mockResolvedValue([mockMapping]);
      await service.onModuleInit();
    });

    it('should update cache entry when newer version is available', async () => {
      const updatedMapping = {
        ...mockMapping,
        version: 2,
        name: 'Updated Name',
      };
      repository.findById.mockResolvedValue(updatedMapping);

      await service.invalidateMapping(mockMapping.id, 2);

      const result = await service.getMapping('shopify', 'order.created');
      expect(result?.name).toBe('Updated Name');
    });

    it('should discard invalidation when cached version is newer or equal', async () => {
      repository.findById.mockResolvedValue({ ...mockMapping, version: 1 });

      await service.invalidateMapping(mockMapping.id, 1);

      const result = await service.getMapping('shopify', 'order.created');
      expect(result?.version).toBe(1);
      expect(result?.name).toBe('Shopify Order Created');
    });

    it('should remove mapping from cache when fetched mapping is inactive', async () => {
      const inactiveMapping = {
        ...mockMapping,
        version: 2,
        isActive: false,
      };
      repository.findById.mockResolvedValue(inactiveMapping);

      await service.invalidateMapping(mockMapping.id, 2);

      expect(service.getCacheStats().size).toBe(0);
    });

    it('should remove mapping from cache when not found in DB (deleted)', async () => {
      repository.findById.mockResolvedValue(null);

      await service.invalidateMapping(mockMapping.id, 2);

      expect(service.getCacheStats().size).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return correct stats', async () => {
      await createModule(true);
      repository.findAllActive.mockResolvedValue([
        mockMapping,
        wildcardMapping,
      ]);
      await service.onModuleInit();

      const stats = service.getCacheStats();
      expect(stats).toEqual({
        size: 2,
        enabled: true,
        ready: true,
      });
    });
  });

  describe('cache warm-up failure scenarios', () => {
    it('should propagate error when findAllActive rejects, ready stays false', async () => {
      await createModule(true);
      repository.findAllActive.mockRejectedValue(
        new Error('DB connection refused'),
      );

      await expect(service.onModuleInit()).rejects.toThrow(
        'DB connection refused',
      );

      expect(service.getCacheStats().ready).toBe(false);

      // getMapping should throw EIS-021 when cache not ready
      try {
        await service.getMapping('shopify', 'order.created');
        fail('Should have thrown');
      } catch (error: any) {
        const response = error.getResponse();
        expect(response.code).toBe('EIS-021');
      }
    });

    it('should set ready=true and size=0 when findAllActive resolves empty', async () => {
      await createModule(true);
      repository.findAllActive.mockResolvedValue([]);

      await service.onModuleInit();

      expect(service.getCacheStats().ready).toBe(true);
      expect(service.getCacheStats().size).toBe(0);
    });

    it('should handle 1000 mappings on warm-up', async () => {
      await createModule(true);

      const largeMappingSet: EventMapping[] = Array.from(
        { length: 1000 },
        (_, i) => ({
          ...mockMapping,
          id: `id-${i}`,
          sourceId: `source-${i}`,
          eventType: `event.type.${i}`,
          name: `Mapping ${i}`,
        }),
      );
      repository.findAllActive.mockResolvedValue(largeMappingSet);

      await service.onModuleInit();

      expect(service.getCacheStats().size).toBe(1000);
      expect(service.getCacheStats().ready).toBe(true);
    });
  });
});
