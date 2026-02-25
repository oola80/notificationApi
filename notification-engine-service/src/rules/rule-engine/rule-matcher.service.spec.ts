import { Test, TestingModule } from '@nestjs/testing';
import { RuleMatcherService } from './rule-matcher.service.js';
import { ConditionEvaluatorService } from './condition-evaluator.service.js';
import { NotificationRulesRepository } from '../notification-rules.repository.js';
import { NotificationRule } from '../entities/notification-rule.entity.js';

describe('RuleMatcherService', () => {
  let matcher: RuleMatcherService;
  let repository: jest.Mocked<NotificationRulesRepository>;
  let conditionEvaluator: jest.Mocked<ConditionEvaluatorService>;

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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RuleMatcherService,
        {
          provide: NotificationRulesRepository,
          useValue: { findByEventType: jest.fn() },
        },
        {
          provide: ConditionEvaluatorService,
          useValue: { evaluateConditions: jest.fn() },
        },
      ],
    }).compile();

    matcher = module.get<RuleMatcherService>(RuleMatcherService);
    repository = module.get(NotificationRulesRepository);
    conditionEvaluator = module.get(ConditionEvaluatorService);
  });

  it('should be defined', () => {
    expect(matcher).toBeDefined();
  });

  describe('matchRules', () => {
    it('should return all matching rules', async () => {
      const rule1 = createRule({ id: 'id-1', priority: 10 });
      const rule2 = createRule({ id: 'id-2', priority: 20 });
      repository.findByEventType.mockResolvedValue([rule1, rule2]);
      conditionEvaluator.evaluateConditions.mockReturnValue(true);

      const result = await matcher.matchRules({
        eventType: 'order.created',
        status: 'confirmed',
      });

      expect(result).toEqual([rule1, rule2]);
      expect(repository.findByEventType).toHaveBeenCalledWith('order.created');
    });

    it('should return empty array when no rules match', async () => {
      const rule = createRule();
      repository.findByEventType.mockResolvedValue([rule]);
      conditionEvaluator.evaluateConditions.mockReturnValue(false);

      const result = await matcher.matchRules({
        eventType: 'order.created',
      });

      expect(result).toEqual([]);
    });

    it('should return empty array when no rules exist for event type', async () => {
      repository.findByEventType.mockResolvedValue([]);

      const result = await matcher.matchRules({
        eventType: 'unknown.event',
      });

      expect(result).toEqual([]);
    });

    it('should stop after exclusive rule match', async () => {
      const rule1 = createRule({ id: 'id-1', priority: 10 });
      const rule2 = createRule({
        id: 'id-2',
        priority: 20,
        isExclusive: true,
      });
      const rule3 = createRule({ id: 'id-3', priority: 30 });
      repository.findByEventType.mockResolvedValue([rule1, rule2, rule3]);
      conditionEvaluator.evaluateConditions.mockReturnValue(true);

      const result = await matcher.matchRules({
        eventType: 'order.created',
      });

      expect(result).toEqual([rule1, rule2]);
      expect(conditionEvaluator.evaluateConditions).toHaveBeenCalledTimes(2);
    });

    it('should keep rules matched before exclusive rule', async () => {
      const rule1 = createRule({ id: 'id-1', priority: 10 });
      const rule2 = createRule({ id: 'id-2', priority: 15 });
      const exclusiveRule = createRule({
        id: 'id-3',
        priority: 20,
        isExclusive: true,
      });
      const rule4 = createRule({ id: 'id-4', priority: 30 });
      repository.findByEventType.mockResolvedValue([
        rule1,
        rule2,
        exclusiveRule,
        rule4,
      ]);
      conditionEvaluator.evaluateConditions.mockReturnValue(true);

      const result = await matcher.matchRules({
        eventType: 'order.created',
      });

      expect(result).toHaveLength(3);
      expect(result).toEqual([rule1, rule2, exclusiveRule]);
    });

    it('should skip exclusive rule if its conditions do not match', async () => {
      const rule1 = createRule({ id: 'id-1', priority: 10 });
      const exclusiveRule = createRule({
        id: 'id-2',
        priority: 20,
        isExclusive: true,
        conditions: { status: 'cancelled' },
      });
      const rule3 = createRule({ id: 'id-3', priority: 30 });
      repository.findByEventType.mockResolvedValue([
        rule1,
        exclusiveRule,
        rule3,
      ]);
      conditionEvaluator.evaluateConditions
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      const result = await matcher.matchRules({
        eventType: 'order.created',
        status: 'confirmed',
      });

      expect(result).toEqual([rule1, rule3]);
    });

    it('should only return rules whose conditions pass', async () => {
      const rule1 = createRule({ id: 'id-1', priority: 10 });
      const rule2 = createRule({
        id: 'id-2',
        priority: 20,
        conditions: { status: 'special' },
      });
      const rule3 = createRule({ id: 'id-3', priority: 30 });
      repository.findByEventType.mockResolvedValue([rule1, rule2, rule3]);
      conditionEvaluator.evaluateConditions
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      const result = await matcher.matchRules({
        eventType: 'order.created',
      });

      expect(result).toEqual([rule1, rule3]);
    });

    it('should pass rule conditions and event payload to evaluator', async () => {
      const rule = createRule({
        conditions: { status: 'confirmed' },
      });
      repository.findByEventType.mockResolvedValue([rule]);
      conditionEvaluator.evaluateConditions.mockReturnValue(true);

      const event = {
        eventType: 'order.created',
        status: 'confirmed',
        amount: 100,
      };
      await matcher.matchRules(event);

      expect(conditionEvaluator.evaluateConditions).toHaveBeenCalledWith(
        { status: 'confirmed' },
        event,
      );
    });

    it('should respect priority ordering from repository', async () => {
      const lowPriority = createRule({ id: 'id-low', priority: 100 });
      const highPriority = createRule({ id: 'id-high', priority: 10 });
      repository.findByEventType.mockResolvedValue([highPriority, lowPriority]);
      conditionEvaluator.evaluateConditions.mockReturnValue(true);

      const result = await matcher.matchRules({
        eventType: 'order.created',
      });

      expect(result[0].id).toBe('id-high');
      expect(result[1].id).toBe('id-low');
    });
  });
});
