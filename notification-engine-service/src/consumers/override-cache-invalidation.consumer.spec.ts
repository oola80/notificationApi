import { Test, TestingModule } from '@nestjs/testing';
import { OverrideCacheInvalidationConsumer } from './override-cache-invalidation.consumer.js';
import { OverrideCacheService } from '../overrides/override-cache.service.js';

describe('OverrideCacheInvalidationConsumer', () => {
  let consumer: OverrideCacheInvalidationConsumer;
  let overrideCacheService: jest.Mocked<OverrideCacheService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OverrideCacheInvalidationConsumer,
        {
          provide: OverrideCacheService,
          useValue: {
            invalidate: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    consumer = module.get<OverrideCacheInvalidationConsumer>(
      OverrideCacheInvalidationConsumer,
    );
    overrideCacheService = module.get(OverrideCacheService);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should invalidate override cache', async () => {
    await consumer.handleOverrideCacheInvalidation({
      eventType: 'order.created',
      action: 'created',
    });

    expect(overrideCacheService.invalidate).toHaveBeenCalledWith(
      'order.created',
    );
  });

  it('should handle updated action', async () => {
    await consumer.handleOverrideCacheInvalidation({
      eventType: 'order.cancelled',
      action: 'updated',
    });

    expect(overrideCacheService.invalidate).toHaveBeenCalledWith(
      'order.cancelled',
    );
  });

  it('should handle deleted action', async () => {
    await consumer.handleOverrideCacheInvalidation({
      eventType: 'shipment.shipped',
      action: 'deleted',
    });

    expect(overrideCacheService.invalidate).toHaveBeenCalledWith(
      'shipment.shipped',
    );
  });

  it('should not throw when invalidation fails', async () => {
    overrideCacheService.invalidate.mockRejectedValue(
      new Error('DB connection lost'),
    );

    await expect(
      consumer.handleOverrideCacheInvalidation({
        eventType: 'order.created',
        action: 'updated',
      }),
    ).resolves.not.toThrow();
  });
});
