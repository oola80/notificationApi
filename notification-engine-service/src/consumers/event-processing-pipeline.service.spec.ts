import { Test, TestingModule } from '@nestjs/testing';
import { EventProcessingPipelineService } from './event-processing-pipeline.service.js';
import { RuleCacheService } from '../rules/rule-cache.service.js';
import { RuleMatcherService } from '../rules/rule-engine/rule-matcher.service.js';
import { PriorityResolverService } from '../rules/rule-engine/priority-resolver.service.js';
import { RecipientResolverService } from '../recipients/recipient-resolver.service.js';
import { ChannelResolverService } from '../recipients/channel-resolver.service.js';
import { DedupKeyResolverService } from '../notifications/suppression/dedup-key-resolver.service.js';
import { SuppressionEvaluatorService } from '../notifications/suppression/suppression-evaluator.service.js';
import { NotificationsRepository } from '../notifications/notifications.repository.js';
import { NotificationLifecycleService } from '../notifications/notification-lifecycle.service.js';
import { TemplateClientService } from '../template-client/template-client.service.js';
import { NotificationPublisherService } from '../rabbitmq/notification-publisher.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { NormalizedEventMessage } from '../rabbitmq/interfaces/normalized-event-message.interface.js';

describe('EventProcessingPipelineService', () => {
  let pipeline: EventProcessingPipelineService;
  let ruleCacheService: jest.Mocked<RuleCacheService>;
  let ruleMatcherService: jest.Mocked<RuleMatcherService>;
  let priorityResolverService: jest.Mocked<PriorityResolverService>;
  let recipientResolverService: jest.Mocked<RecipientResolverService>;
  let channelResolverService: jest.Mocked<ChannelResolverService>;
  let _dedupKeyResolverService: jest.Mocked<DedupKeyResolverService>;
  let suppressionEvaluatorService: jest.Mocked<SuppressionEvaluatorService>;
  let notificationsRepository: jest.Mocked<NotificationsRepository>;
  let lifecycleService: jest.Mocked<NotificationLifecycleService>;
  let templateClientService: jest.Mocked<TemplateClientService>;
  let notificationPublisher: jest.Mocked<NotificationPublisherService>;
  let _metricsService: jest.Mocked<MetricsService>;

  const mockEvent: NormalizedEventMessage = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-123',
    sourceId: 'src-1',
    cycleId: 'cycle-1',
    eventType: 'order.created',
    priority: 'normal',
    normalizedPayload: {
      orderId: '12345',
      amount: 99.99,
      customerEmail: 'john@example.com',
      customerId: 'cust-1',
    },
    publishedAt: '2026-01-01T00:00:00Z',
  };

  const mockRule = {
    id: 'rule-1',
    name: 'Order Confirmation',
    description: null,
    eventType: 'order.created',
    conditions: null,
    actions: [
      {
        templateId: 'tpl-order-confirm',
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
  };

  const mockNotification = {
    id: '1',
    notificationId: 'notif-001',
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    ruleId: 'rule-1',
    templateId: 'tpl-order-confirm',
    templateVersion: null,
    channel: 'email',
    status: 'PENDING',
    priority: 'normal',
    recipientEmail: 'john@example.com',
    recipientPhone: null,
    recipientName: null,
    customerId: 'cust-1',
    dedupKeyHash: null,
    dedupKeyValues: null,
    renderedContent: null,
    correlationId: 'corr-123',
    cycleId: 'cycle-1',
    sourceId: 'src-1',
    eventType: 'order.created',
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventProcessingPipelineService,
        {
          provide: RuleCacheService,
          useValue: { getRulesByEventType: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: RuleMatcherService,
          useValue: { matchFromRules: jest.fn().mockReturnValue([]) },
        },
        {
          provide: PriorityResolverService,
          useValue: {
            resolveEffectivePriority: jest.fn().mockReturnValue('normal'),
          },
        },
        {
          provide: RecipientResolverService,
          useValue: { resolveRecipients: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: ChannelResolverService,
          useValue: {
            resolveChannels: jest.fn().mockResolvedValue({
              effectiveChannels: ['email'],
              filtered: false,
            }),
          },
        },
        {
          provide: DedupKeyResolverService,
          useValue: {
            resolve: jest.fn().mockReturnValue({
              hash: 'abc123',
              resolvedValues: {},
            }),
          },
        },
        {
          provide: SuppressionEvaluatorService,
          useValue: {
            evaluate: jest.fn().mockResolvedValue({ suppressed: false }),
          },
        },
        {
          provide: NotificationsRepository,
          useValue: {
            createNotification: jest.fn().mockResolvedValue(mockNotification),
            updateRenderedContent: jest.fn().mockResolvedValue(undefined),
            updateTemplateVersion: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationLifecycleService,
          useValue: {
            transition: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: TemplateClientService,
          useValue: {
            render: jest.fn().mockResolvedValue({
              channel: 'email',
              subject: 'Order Confirmed',
              body: '<p>Your order is confirmed</p>',
              templateVersion: 3,
            }),
          },
        },
        {
          provide: NotificationPublisherService,
          useValue: {
            publishToDeliver: jest.fn().mockResolvedValue(undefined),
            publishStatus: jest.fn(),
            publishConfigEvent: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementEventsConsumed: jest.fn(),
            incrementRulesMatched: jest.fn(),
            incrementNotificationsCreated: jest.fn(),
            incrementSuppressed: jest.fn(),
            incrementDispatched: jest.fn(),
            incrementFailed: jest.fn(),
            incrementTemplateRender: jest.fn(),
            observeEventProcessing: jest.fn(),
            observeTemplateRender: jest.fn(),
            observeRuleEvaluation: jest.fn(),
          },
        },
      ],
    }).compile();

    pipeline = module.get(EventProcessingPipelineService);
    ruleCacheService = module.get(RuleCacheService);
    ruleMatcherService = module.get(RuleMatcherService);
    priorityResolverService = module.get(PriorityResolverService);
    recipientResolverService = module.get(RecipientResolverService);
    channelResolverService = module.get(ChannelResolverService);
    _dedupKeyResolverService = module.get(DedupKeyResolverService);
    suppressionEvaluatorService = module.get(SuppressionEvaluatorService);
    notificationsRepository = module.get(NotificationsRepository);
    lifecycleService = module.get(NotificationLifecycleService);
    templateClientService = module.get(TemplateClientService);
    notificationPublisher = module.get(NotificationPublisherService);
    _metricsService = module.get(MetricsService);
  });

  it('should be defined', () => {
    expect(pipeline).toBeDefined();
  });

  describe('full 9-step flow', () => {
    it('should process event through full pipeline', async () => {
      ruleCacheService.getRulesByEventType.mockResolvedValue([mockRule as any]);
      ruleMatcherService.matchFromRules.mockReturnValue([mockRule as any]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        {
          email: 'john@example.com',
          customerId: 'cust-1',
        },
      ]);

      await pipeline.processEvent(mockEvent);

      // ii. Rule lookup
      expect(ruleCacheService.getRulesByEventType).toHaveBeenCalledWith(
        'order.created',
      );

      // iii. Match rules
      expect(ruleMatcherService.matchFromRules).toHaveBeenCalledWith(
        [mockRule],
        expect.objectContaining({
          eventType: 'order.created',
          orderId: '12345',
        }),
      );

      // v. Resolve priority
      expect(
        priorityResolverService.resolveEffectivePriority,
      ).toHaveBeenCalledWith('normal', null);

      // vi. Resolve recipients
      expect(recipientResolverService.resolveRecipients).toHaveBeenCalledWith(
        mockRule.actions[0],
        mockEvent.normalizedPayload,
      );

      // vii. Resolve channels
      expect(channelResolverService.resolveChannels).toHaveBeenCalledWith(
        ['email'],
        'cust-1',
        'order.created',
      );

      // ix. Create notification
      expect(notificationsRepository.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: mockEvent.eventId,
          ruleId: 'rule-1',
          channel: 'email',
          status: 'PENDING',
        }),
      );

      // ix. Transition to PROCESSING
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        'notif-001',
        'PROCESSING',
      );

      // x. Render template
      expect(templateClientService.render).toHaveBeenCalledWith(
        'tpl-order-confirm',
        'email',
        mockEvent.normalizedPayload,
      );

      // x. Transition to RENDERING
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        'notif-001',
        'RENDERING',
      );

      // xi. Transition to DELIVERING
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        'notif-001',
        'DELIVERING',
      );

      // xii. Dispatch
      expect(notificationPublisher.publishToDeliver).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: 'notif-001',
          eventId: mockEvent.eventId,
          ruleId: 'rule-1',
          channel: 'email',
          priority: 'normal',
          content: expect.objectContaining({
            subject: 'Order Confirmed',
            body: '<p>Your order is confirmed</p>',
            templateVersion: 3,
            templateName: 'tpl-order-confirm',
          }),
        }),
      );

      // xii. Transition to SENT
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        'notif-001',
        'SENT',
      );
    });
  });

  describe('no matching rules', () => {
    it('should ACK with no notifications when no rules match', async () => {
      ruleCacheService.getRulesByEventType.mockResolvedValue([mockRule as any]);
      ruleMatcherService.matchFromRules.mockReturnValue([]);

      await pipeline.processEvent(mockEvent);

      expect(notificationsRepository.createNotification).not.toHaveBeenCalled();
      expect(templateClientService.render).not.toHaveBeenCalled();
      expect(notificationPublisher.publishToDeliver).not.toHaveBeenCalled();
    });

    it('should ACK when no rules exist for event type', async () => {
      ruleCacheService.getRulesByEventType.mockResolvedValue([]);
      ruleMatcherService.matchFromRules.mockReturnValue([]);

      await pipeline.processEvent(mockEvent);

      expect(notificationsRepository.createNotification).not.toHaveBeenCalled();
    });
  });

  describe('suppression', () => {
    it('should skip notification creation when suppressed', async () => {
      const ruleWithSuppression = {
        ...mockRule,
        suppression: {
          dedupKey: ['orderId', 'recipient.email'],
          modes: [{ type: 'dedup', windowMinutes: 60 }],
        },
      };

      ruleCacheService.getRulesByEventType.mockResolvedValue([
        ruleWithSuppression as any,
      ]);
      ruleMatcherService.matchFromRules.mockReturnValue([
        ruleWithSuppression as any,
      ]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        { email: 'john@example.com', customerId: 'cust-1' },
      ]);
      suppressionEvaluatorService.evaluate.mockResolvedValue({
        suppressed: true,
        reason: 'Duplicate within 60 minute window',
        mode: 'dedup',
      });

      await pipeline.processEvent(mockEvent);

      expect(notificationsRepository.createNotification).not.toHaveBeenCalled();
      expect(notificationPublisher.publishStatus).toHaveBeenCalledWith(
        mockEvent.eventId,
        'PROCESSING',
        'SUPPRESSED',
        'email',
        expect.objectContaining({ ruleId: 'rule-1' }),
      );
    });
  });

  describe('preference filtering', () => {
    it('should skip when all channels filtered by preferences', async () => {
      ruleCacheService.getRulesByEventType.mockResolvedValue([mockRule as any]);
      ruleMatcherService.matchFromRules.mockReturnValue([mockRule as any]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        { email: 'john@example.com', customerId: 'cust-1' },
      ]);
      channelResolverService.resolveChannels.mockResolvedValue({
        effectiveChannels: [],
        filtered: true,
        reason: 'all-channels-opted-out',
      });

      await pipeline.processEvent(mockEvent);

      expect(notificationsRepository.createNotification).not.toHaveBeenCalled();
      expect(notificationPublisher.publishToDeliver).not.toHaveBeenCalled();
    });
  });

  describe('template render failure', () => {
    it('should transition to FAILED when template render fails', async () => {
      ruleCacheService.getRulesByEventType.mockResolvedValue([mockRule as any]);
      ruleMatcherService.matchFromRules.mockReturnValue([mockRule as any]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        { email: 'john@example.com', customerId: 'cust-1' },
      ]);
      templateClientService.render.mockRejectedValue(
        new Error('Template service unavailable'),
      );

      await pipeline.processEvent(mockEvent);

      expect(notificationsRepository.createNotification).toHaveBeenCalled();
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        'notif-001',
        'FAILED',
        expect.objectContaining({
          errorMessage: expect.stringContaining('Template render failed'),
        }),
      );
      expect(notificationPublisher.publishToDeliver).not.toHaveBeenCalled();
    });
  });

  describe('dispatch failure', () => {
    it('should transition to FAILED when dispatch fails', async () => {
      ruleCacheService.getRulesByEventType.mockResolvedValue([mockRule as any]);
      ruleMatcherService.matchFromRules.mockReturnValue([mockRule as any]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        { email: 'john@example.com', customerId: 'cust-1' },
      ]);
      notificationPublisher.publishToDeliver.mockRejectedValue(
        new Error('RabbitMQ connection lost'),
      );

      await pipeline.processEvent(mockEvent);

      expect(lifecycleService.transition).toHaveBeenCalledWith(
        'notif-001',
        'FAILED',
        expect.objectContaining({
          errorMessage: expect.stringContaining('Dispatch failed'),
        }),
      );
    });
  });

  describe('multi-action, multi-recipient', () => {
    it('should process multiple actions and recipients independently', async () => {
      const multiActionRule = {
        ...mockRule,
        actions: [
          {
            templateId: 'tpl-email',
            channels: ['email'],
            recipientType: 'customer',
          },
          {
            templateId: 'tpl-sms',
            channels: ['sms'],
            recipientType: 'customer',
          },
        ],
      };

      ruleCacheService.getRulesByEventType.mockResolvedValue([
        multiActionRule as any,
      ]);
      ruleMatcherService.matchFromRules.mockReturnValue([
        multiActionRule as any,
      ]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        { email: 'john@example.com', customerId: 'cust-1' },
      ]);
      channelResolverService.resolveChannels
        .mockResolvedValueOnce({
          effectiveChannels: ['email'],
          filtered: false,
        })
        .mockResolvedValueOnce({
          effectiveChannels: ['sms'],
          filtered: false,
        });

      await pipeline.processEvent(mockEvent);

      // Two actions × one recipient × one channel each = 2 notifications
      expect(notificationsRepository.createNotification).toHaveBeenCalledTimes(
        2,
      );
      expect(notificationPublisher.publishToDeliver).toHaveBeenCalledTimes(2);
    });
  });

  describe('partial failures', () => {
    it('should continue processing when one recipient fails', async () => {
      const groupRule = {
        ...mockRule,
        actions: [
          {
            templateId: 'tpl-1',
            channels: ['email'],
            recipientType: 'group',
            recipientGroupId: 'grp-1',
          },
        ],
      };

      ruleCacheService.getRulesByEventType.mockResolvedValue([
        groupRule as any,
      ]);
      ruleMatcherService.matchFromRules.mockReturnValue([groupRule as any]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        { email: 'user1@example.com', customerId: 'cust-1' },
        { email: 'user2@example.com', customerId: 'cust-2' },
      ]);

      // First recipient fails at template render, second succeeds
      templateClientService.render
        .mockRejectedValueOnce(new Error('Template error'))
        .mockResolvedValueOnce({
          channel: 'email',
          subject: 'Subject',
          body: 'Body',
          templateVersion: 1,
        });

      const notif1 = { ...mockNotification, notificationId: 'notif-001' };
      const notif2 = { ...mockNotification, notificationId: 'notif-002' };
      notificationsRepository.createNotification
        .mockResolvedValueOnce(notif1 as any)
        .mockResolvedValueOnce(notif2 as any);

      await pipeline.processEvent(mockEvent);

      // Both recipients should have notifications created
      expect(notificationsRepository.createNotification).toHaveBeenCalledTimes(
        2,
      );

      // First fails, second succeeds
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        'notif-001',
        'FAILED',
        expect.any(Object),
      );
      expect(notificationPublisher.publishToDeliver).toHaveBeenCalledTimes(1);
    });
  });

  describe('priority resolution', () => {
    it('should use rule delivery priority when set', async () => {
      const priorityRule = {
        ...mockRule,
        deliveryPriority: 'critical',
      };

      ruleCacheService.getRulesByEventType.mockResolvedValue([
        priorityRule as any,
      ]);
      ruleMatcherService.matchFromRules.mockReturnValue([priorityRule as any]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        { email: 'john@example.com', customerId: 'cust-1' },
      ]);
      priorityResolverService.resolveEffectivePriority.mockReturnValue(
        'critical',
      );

      await pipeline.processEvent(mockEvent);

      expect(
        priorityResolverService.resolveEffectivePriority,
      ).toHaveBeenCalledWith('normal', 'critical');
    });
  });

  describe('exclusive rules', () => {
    it('should process only matched rules from exclusive evaluation', async () => {
      const exclusiveRule = {
        ...mockRule,
        id: 'rule-exclusive',
        isExclusive: true,
      };

      // RuleMatcherService.matchFromRules handles exclusive logic
      // and returns only up to the exclusive rule
      ruleCacheService.getRulesByEventType.mockResolvedValue([
        mockRule as any,
        exclusiveRule as any,
      ]);
      ruleMatcherService.matchFromRules.mockReturnValue([exclusiveRule as any]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        { email: 'john@example.com', customerId: 'cust-1' },
      ]);

      await pipeline.processEvent(mockEvent);

      // Should only process the exclusive rule's actions
      expect(notificationsRepository.createNotification).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe('WhatsApp channelMetadata dispatch', () => {
    const mockWhatsAppRule = {
      ...mockRule,
      id: 'rule-wa',
      name: 'Order Delay WhatsApp',
      eventType: 'order.delay',
      actions: [
        {
          templateId: 'tpl-order-delay',
          channels: ['whatsapp'],
          recipientType: 'customer',
        },
      ],
    };

    const whatsAppEvent: NormalizedEventMessage = {
      ...mockEvent,
      eventType: 'order.delay',
      normalizedPayload: {
        customerName: 'Juan',
        orderId: 'ORD-123',
        customerPhone: '+50212345678',
        customerId: 'cust-1',
      },
    };

    it('should use metaTemplateName from channelMetadata for WhatsApp dispatch', async () => {
      ruleCacheService.getRulesByEventType.mockResolvedValue([
        mockWhatsAppRule as any,
      ]);
      ruleMatcherService.matchFromRules.mockReturnValue([
        mockWhatsAppRule as any,
      ]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        { phone: '+50212345678', customerId: 'cust-1' },
      ]);
      channelResolverService.resolveChannels.mockResolvedValue({
        effectiveChannels: ['whatsapp'],
        filtered: false,
      });
      templateClientService.render.mockResolvedValue({
        channel: 'whatsapp',
        body: 'Hola Juan, lamentamos informarle que su orden ORD-123 se encuentra retrasada.',
        templateVersion: 1,
        templateId: 'tpl-order-delay',
        channelMetadata: {
          metaTemplateName: 'order_delay',
          metaTemplateLanguage: 'es_MX',
          metaTemplateParameters: [{ name: 'customer_name', field: 'customerName' }, { name: 'order_id', field: 'orderId' }],
        },
      });

      await pipeline.processEvent(whatsAppEvent);

      expect(notificationPublisher.publishToDeliver).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'whatsapp',
          content: expect.objectContaining({
            templateName: 'order_delay',
            templateLanguage: 'es_MX',
            templateParameters: [{ name: 'customer_name', value: 'Juan' }, { name: 'order_id', value: 'ORD-123' }],
          }),
        }),
      );
    });

    it('should fall back to action.templateId when channelMetadata has no metaTemplateName', async () => {
      ruleCacheService.getRulesByEventType.mockResolvedValue([
        mockWhatsAppRule as any,
      ]);
      ruleMatcherService.matchFromRules.mockReturnValue([
        mockWhatsAppRule as any,
      ]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        { phone: '+50212345678', customerId: 'cust-1' },
      ]);
      channelResolverService.resolveChannels.mockResolvedValue({
        effectiveChannels: ['whatsapp'],
        filtered: false,
      });
      templateClientService.render.mockResolvedValue({
        channel: 'whatsapp',
        body: 'Hello',
        templateVersion: 1,
        templateId: 'tpl-order-delay',
      });

      await pipeline.processEvent(whatsAppEvent);

      expect(notificationPublisher.publishToDeliver).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            templateName: 'tpl-order-delay',
          }),
        }),
      );
    });

    it('should use action.templateId for email dispatch (regression)', async () => {
      const emailRule = {
        ...mockRule,
        actions: [
          {
            templateId: 'tpl-order-delay-email',
            channels: ['email'],
            recipientType: 'customer',
          },
        ],
      };

      ruleCacheService.getRulesByEventType.mockResolvedValue([
        emailRule as any,
      ]);
      ruleMatcherService.matchFromRules.mockReturnValue([emailRule as any]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        { email: 'juan@example.com', customerId: 'cust-1' },
      ]);
      templateClientService.render.mockResolvedValue({
        channel: 'email',
        subject: 'Order Delay',
        body: '<p>Order delayed</p>',
        templateVersion: 1,
        templateId: 'tpl-order-delay-email',
        channelMetadata: {
          metaTemplateName: 'order_delay',
          metaTemplateLanguage: 'es_MX',
        },
      });

      await pipeline.processEvent(mockEvent);

      expect(notificationPublisher.publishToDeliver).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'email',
          content: expect.objectContaining({
            templateName: 'tpl-order-delay-email',
          }),
        }),
      );
    });
  });

  describe('parallel channel processing', () => {
    it('should process multiple channels in parallel', async () => {
      const multiChannelRule = {
        ...mockRule,
        actions: [
          {
            templateId: 'tpl-multi',
            channels: ['email', 'sms', 'push'],
            recipientType: 'customer',
          },
        ],
      };

      ruleCacheService.getRulesByEventType.mockResolvedValue([
        multiChannelRule as any,
      ]);
      ruleMatcherService.matchFromRules.mockReturnValue([
        multiChannelRule as any,
      ]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        {
          email: 'john@example.com',
          phone: '+1234567890',
          customerId: 'cust-1',
        },
      ]);
      channelResolverService.resolveChannels.mockResolvedValue({
        effectiveChannels: ['email', 'sms', 'push'],
        filtered: false,
      });

      const notif1 = { ...mockNotification, notificationId: 'notif-001' };
      const notif2 = { ...mockNotification, notificationId: 'notif-002' };
      const notif3 = { ...mockNotification, notificationId: 'notif-003' };
      notificationsRepository.createNotification
        .mockResolvedValueOnce(notif1 as any)
        .mockResolvedValueOnce(notif2 as any)
        .mockResolvedValueOnce(notif3 as any);

      await pipeline.processEvent(mockEvent);

      // 3 channels → 3 notifications created
      expect(notificationsRepository.createNotification).toHaveBeenCalledTimes(
        3,
      );
      expect(notificationPublisher.publishToDeliver).toHaveBeenCalledTimes(3);
    });

    it('should isolate channel failures — one fail does not block others', async () => {
      const twoChannelRule = {
        ...mockRule,
        actions: [
          {
            templateId: 'tpl-dual',
            channels: ['email', 'sms'],
            recipientType: 'customer',
          },
        ],
      };

      ruleCacheService.getRulesByEventType.mockResolvedValue([
        twoChannelRule as any,
      ]);
      ruleMatcherService.matchFromRules.mockReturnValue([
        twoChannelRule as any,
      ]);
      recipientResolverService.resolveRecipients.mockResolvedValue([
        {
          email: 'john@example.com',
          phone: '+1234567890',
          customerId: 'cust-1',
        },
      ]);
      channelResolverService.resolveChannels.mockResolvedValue({
        effectiveChannels: ['email', 'sms'],
        filtered: false,
      });

      const notif1 = {
        ...mockNotification,
        notificationId: 'notif-001',
        channel: 'email',
      };
      const notif2 = {
        ...mockNotification,
        notificationId: 'notif-002',
        channel: 'sms',
      };
      notificationsRepository.createNotification
        .mockResolvedValueOnce(notif1 as any)
        .mockResolvedValueOnce(notif2 as any);

      // First channel (email) render fails, second (sms) succeeds
      templateClientService.render
        .mockRejectedValueOnce(new Error('Email render error'))
        .mockResolvedValueOnce({
          channel: 'sms',
          body: 'SMS body',
          templateVersion: 1,
        });

      await pipeline.processEvent(mockEvent);

      // Both notifications should be created
      expect(notificationsRepository.createNotification).toHaveBeenCalledTimes(
        2,
      );

      // Email failed → FAILED transition
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        'notif-001',
        'FAILED',
        expect.objectContaining({
          errorMessage: expect.stringContaining('Template render failed'),
        }),
      );

      // SMS succeeded → dispatched
      expect(notificationPublisher.publishToDeliver).toHaveBeenCalledTimes(1);
      expect(notificationPublisher.publishToDeliver).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: 'notif-002',
          channel: 'sms',
        }),
      );
    });
  });
});
