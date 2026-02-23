import { Test, TestingModule } from '@nestjs/testing';
import { MappingCacheConsumer } from './mapping-cache.consumer.js';
import { MappingCacheService } from './mapping-cache.service.js';
import { MetricsService } from '../metrics/metrics.service.js';

describe('MappingCacheConsumer', () => {
  let consumer: MappingCacheConsumer;
  let mappingCacheService: jest.Mocked<MappingCacheService>;
  let metricsService: jest.Mocked<MetricsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MappingCacheConsumer,
        {
          provide: MappingCacheService,
          useValue: {
            invalidateMapping: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementCacheInvalidation: jest.fn(),
          },
        },
      ],
    }).compile();

    consumer = module.get<MappingCacheConsumer>(MappingCacheConsumer);
    mappingCacheService = module.get(MappingCacheService);
    metricsService = module.get(MetricsService);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should delegate to MappingCacheService.invalidateMapping', async () => {
    const message = { id: 'mapping-uuid', version: 2 };

    await consumer.handleMappingChanged(message);

    expect(mappingCacheService.invalidateMapping).toHaveBeenCalledWith(
      'mapping-uuid',
      2,
    );
  });

  it('should increment cache invalidation metric on success', async () => {
    const message = { id: 'mapping-uuid', version: 2 };
    mappingCacheService.invalidateMapping.mockResolvedValue(undefined);

    await consumer.handleMappingChanged(message);

    expect(metricsService.incrementCacheInvalidation).toHaveBeenCalled();
  });

  it('should not throw when invalidateMapping fails', async () => {
    const message = { id: 'mapping-uuid', version: 2 };
    mappingCacheService.invalidateMapping.mockRejectedValue(
      new Error('DB error'),
    );

    await expect(consumer.handleMappingChanged(message)).resolves.not.toThrow();
  });
});
