import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RuleCacheService } from './rule-cache.service.js';
import { NotificationRulesRepository } from './notification-rules.repository.js';
import { NotificationRule } from './entities/notification-rule.entity.js';
import { MetricsService } from '../metrics/metrics.service.js';

describe('RuleCacheService', () => {
  let service: RuleCacheService;
  let repository: jest.Mocked<NotificationRulesRepository>;
  let cacheEnabled: boolean;

  const createRule = (
    overrides: Partial<NotificationRule> = {},
  ): NotificationRule => ({
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Test Rule',
    description: null,
    eventType: 'order.created',
    conditions: null,
    actions: [
      {
        templateId: 'tpl-1',
        channels: ['email'],
        recipientType: 'customer',
      },
    ],
    suppression: null,
    deliveryPriority: null,
    priority: 100,
    isExclusive: false,
    isActive: true,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

  const buildModule = async (enabled: boolean) => {
    cacheEnabled = enabled;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleCacheService,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultVal?: any) => {
                if (key === 'app.ruleCacheEnabled') return cacheEnabled;
                return defaultVal;
              }),
          },
        },
        {
          provide: NotificationRulesRepository,
          useValue: {
            findByEventType: jest.fn().mockResolvedValue([]),
            findAllActive: jest.fn().mockResolvedValue([]),
            findById: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            setRuleCacheSize: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RuleCacheService>(RuleCacheService);
    repository = module.get(NotificationRulesRepository);
  };

  describe('when cache is enabled', () => {
    beforeEach(async () => {
      await buildModule(true);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should report enabled', () => {
      expect(service.isEnabled()).toBe(true);
    });

    describe('onModuleInit', () => {
      it('should warm up cache on init', async () => {
        const rules = [
          createRule({ id: 'r1', eventType: 'order.created', priority: 10 }),
          createRule({ id: 'r2', eventType: 'order.created', priority: 20 }),
          createRule({ id: 'r3', eventType: 'shipment.shipped', priority: 10 }),
        ];
        repository.findAllActive.mockResolvedValue(rules);

        await service.onModuleInit();

        expect(repository.findAllActive).toHaveBeenCalled();
        expect(service.size).toBe(2); // 2 distinct event types
      });
    });

    describe('warmUp', () => {
      it('should load all active rules grouped by event type', async () => {
        const rules = [
          createRule({ id: 'r1', eventType: 'order.created' }),
          createRule({ id: 'r2', eventType: 'order.cancelled' }),
        ];
        repository.findAllActive.mockResolvedValue(rules);

        await service.warmUp();

        expect(service.size).toBe(2);
      });

      it('should clear previous cache entries on warm-up', async () => {
        repository.findAllActive.mockResolvedValue([
          createRule({ id: 'r1', eventType: 'order.created' }),
        ]);
        await service.warmUp();
        expect(service.size).toBe(1);

        repository.findAllActive.mockResolvedValue([]);
        await service.warmUp();
        expect(service.size).toBe(0);
      });
    });

    describe('getRulesByEventType', () => {
      it('should return cached rules on cache hit', async () => {
        const rules = [createRule({ id: 'r1', eventType: 'order.created' })];
        repository.findAllActive.mockResolvedValue(rules);
        await service.warmUp();

        const result = await service.getRulesByEventType('order.created');

        expect(result).toEqual(rules);
        expect(repository.findByEventType).not.toHaveBeenCalled();
      });

      it('should fetch from DB and cache on miss', async () => {
        const rules = [createRule({ id: 'r1', eventType: 'order.cancelled' })];
        repository.findByEventType.mockResolvedValue(rules);

        const result = await service.getRulesByEventType('order.cancelled');

        expect(result).toEqual(rules);
        expect(repository.findByEventType).toHaveBeenCalledWith(
          'order.cancelled',
        );

        // Second call should hit cache
        await service.getRulesByEventType('order.cancelled');
        expect(repository.findByEventType).toHaveBeenCalledTimes(1);
      });
    });

    describe('invalidateRule', () => {
      it('should refresh cache for the rule event type', async () => {
        const rule = createRule({
          id: 'r1',
          eventType: 'order.created',
          updatedAt: new Date('2026-01-01T00:00:00Z'),
        });

        // Warm up with initial data
        repository.findAllActive.mockResolvedValue([rule]);
        await service.warmUp();

        // Now invalidate with a newer timestamp
        const updatedRule = {
          ...rule,
          name: 'Updated Rule',
          updatedAt: new Date('2026-01-02T00:00:00Z'),
        };
        repository.findById.mockResolvedValue(updatedRule as NotificationRule);
        repository.findByEventType.mockResolvedValue([
          updatedRule as NotificationRule,
        ]);

        await service.invalidateRule('r1', '2026-01-02T00:00:00Z');

        expect(repository.findById).toHaveBeenCalledWith('r1');
        expect(repository.findByEventType).toHaveBeenCalledWith(
          'order.created',
        );
      });

      it('should skip invalidation when rule not found', async () => {
        repository.findById.mockResolvedValue(null);

        await service.invalidateRule('nonexistent', '2026-01-01T00:00:00Z');

        expect(repository.findByEventType).not.toHaveBeenCalled();
      });

      it('should skip invalidation when cached entry is newer', async () => {
        const rule = createRule({
          id: 'r1',
          eventType: 'order.created',
          updatedAt: new Date('2026-01-05T00:00:00Z'),
        });

        repository.findAllActive.mockResolvedValue([rule]);
        await service.warmUp();

        repository.findById.mockResolvedValue(rule);

        // Invalidation with older timestamp should be skipped
        await service.invalidateRule('r1', '2026-01-03T00:00:00Z');

        expect(repository.findByEventType).not.toHaveBeenCalled();
      });
    });
  });

  describe('when cache is disabled', () => {
    beforeEach(async () => {
      await buildModule(false);
    });

    it('should report disabled', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('should not warm up on init', async () => {
      await service.onModuleInit();
      expect(repository.findAllActive).not.toHaveBeenCalled();
    });

    it('should delegate to repository on getRulesByEventType', async () => {
      const rules = [createRule()];
      repository.findByEventType.mockResolvedValue(rules);

      const result = await service.getRulesByEventType('order.created');

      expect(result).toEqual(rules);
      expect(repository.findByEventType).toHaveBeenCalledWith('order.created');
    });
  });
});
