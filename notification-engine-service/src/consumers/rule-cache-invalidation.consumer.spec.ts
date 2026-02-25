import { Test, TestingModule } from '@nestjs/testing';
import { RuleCacheInvalidationConsumer } from './rule-cache-invalidation.consumer.js';
import { RuleCacheService } from '../rules/rule-cache.service.js';

describe('RuleCacheInvalidationConsumer', () => {
  let consumer: RuleCacheInvalidationConsumer;
  let ruleCacheService: jest.Mocked<RuleCacheService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleCacheInvalidationConsumer,
        {
          provide: RuleCacheService,
          useValue: {
            isEnabled: jest.fn().mockReturnValue(true),
            invalidateRule: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    consumer = module.get<RuleCacheInvalidationConsumer>(
      RuleCacheInvalidationConsumer,
    );
    ruleCacheService = module.get(RuleCacheService);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should invalidate rule cache when enabled', async () => {
    await consumer.handleRuleCacheInvalidation({
      ruleId: 'rule-1',
      timestamp: '2026-01-01T00:00:00Z',
      action: 'updated',
    });

    expect(ruleCacheService.invalidateRule).toHaveBeenCalledWith(
      'rule-1',
      '2026-01-01T00:00:00Z',
    );
  });

  it('should skip invalidation when cache is disabled', async () => {
    ruleCacheService.isEnabled.mockReturnValue(false);

    await consumer.handleRuleCacheInvalidation({
      ruleId: 'rule-1',
      timestamp: '2026-01-01T00:00:00Z',
      action: 'updated',
    });

    expect(ruleCacheService.invalidateRule).not.toHaveBeenCalled();
  });

  it('should not throw when invalidation fails', async () => {
    ruleCacheService.invalidateRule.mockRejectedValue(
      new Error('DB connection lost'),
    );

    await expect(
      consumer.handleRuleCacheInvalidation({
        ruleId: 'rule-1',
        timestamp: '2026-01-01T00:00:00Z',
        action: 'updated',
      }),
    ).resolves.not.toThrow();
  });

  it('should handle created action', async () => {
    await consumer.handleRuleCacheInvalidation({
      ruleId: 'rule-2',
      timestamp: '2026-01-02T00:00:00Z',
      action: 'created',
    });

    expect(ruleCacheService.invalidateRule).toHaveBeenCalledWith(
      'rule-2',
      '2026-01-02T00:00:00Z',
    );
  });

  it('should handle deleted action', async () => {
    await consumer.handleRuleCacheInvalidation({
      ruleId: 'rule-3',
      timestamp: '2026-01-03T00:00:00Z',
      action: 'deleted',
    });

    expect(ruleCacheService.invalidateRule).toHaveBeenCalledWith(
      'rule-3',
      '2026-01-03T00:00:00Z',
    );
  });
});
