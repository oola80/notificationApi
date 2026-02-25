import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationStatusLogRepository } from './notification-status-log.repository.js';
import { NotificationRecipientsRepository } from './notification-recipients.repository.js';
import { NotificationLifecycleService } from './notification-lifecycle.service.js';
import { TemplateClientService } from '../template-client/template-client.service.js';
import { NotificationPublisherService } from '../rabbitmq/notification-publisher.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { Notification } from './entities/notification.entity.js';
import { NotificationStatusLog } from './entities/notification-status-log.entity.js';
import { NotificationRecipient } from './entities/notification-recipient.entity.js';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationsRepo: jest.Mocked<NotificationsRepository>;
  let statusLogRepo: jest.Mocked<NotificationStatusLogRepository>;
  let recipientsRepo: jest.Mocked<NotificationRecipientsRepository>;
  let lifecycleService: jest.Mocked<NotificationLifecycleService>;
  let templateClient: jest.Mocked<TemplateClientService>;
  let publisher: jest.Mocked<NotificationPublisherService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockNotification: Notification = {
    id: '1',
    notificationId: '550e8400-e29b-41d4-a716-446655440000',
    eventId: '660e8400-e29b-41d4-a716-446655440001',
    ruleId: '770e8400-e29b-41d4-a716-446655440002',
    templateId: 'tpl-order-confirm',
    templateVersion: null,
    channel: 'email',
    status: 'PENDING',
    priority: 'normal',
    recipientEmail: 'test@example.com',
    recipientPhone: null,
    recipientName: 'Test User',
    customerId: 'cust-001',
    dedupKeyHash: null,
    dedupKeyValues: null,
    renderedContent: null,
    correlationId: null,
    cycleId: null,
    sourceId: null,
    eventType: 'order.created',
    errorMessage: null,
    createdAt: new Date('2026-02-24T10:00:00Z'),
    updatedAt: new Date('2026-02-24T10:00:00Z'),
  };

  const mockLogEntry: NotificationStatusLog = {
    id: '1',
    notificationId: '550e8400-e29b-41d4-a716-446655440000',
    fromStatus: null,
    toStatus: 'PENDING',
    channel: 'email',
    metadata: null,
    createdAt: new Date('2026-02-24T10:00:00Z'),
  };

  const mockRecipient: NotificationRecipient = {
    id: '1',
    notificationId: '550e8400-e29b-41d4-a716-446655440000',
    recipientType: 'customer',
    email: 'test@example.com',
    phone: null,
    deviceToken: null,
    memberName: 'Test User',
    status: 'PENDING',
    createdAt: new Date('2026-02-24T10:00:00Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: NotificationsRepository,
          useValue: {
            findByNotificationId: jest.fn(),
            findWithFilters: jest.fn(),
            createNotification: jest.fn(),
            updateStatus: jest.fn(),
            updateRenderedContent: jest.fn().mockResolvedValue(undefined),
            updateTemplateVersion: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationStatusLogRepository,
          useValue: {
            createLogEntry: jest.fn().mockResolvedValue(mockLogEntry),
            findByNotificationId: jest.fn().mockResolvedValue([mockLogEntry]),
          },
        },
        {
          provide: NotificationRecipientsRepository,
          useValue: {
            createBatch: jest.fn().mockResolvedValue([mockRecipient]),
            findByNotificationId: jest.fn().mockResolvedValue([mockRecipient]),
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
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementNotificationsCreated: jest.fn(),
            incrementTemplateRender: jest.fn(),
            incrementDispatched: jest.fn(),
            incrementFailed: jest.fn(),
            observeTemplateRender: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    notificationsRepo = module.get(NotificationsRepository);
    statusLogRepo = module.get(NotificationStatusLogRepository);
    recipientsRepo = module.get(NotificationRecipientsRepository);
    lifecycleService = module.get(NotificationLifecycleService);
    templateClient = module.get(TemplateClientService);
    publisher = module.get(NotificationPublisherService);
    metricsService = module.get(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a notification with PENDING status', async () => {
      notificationsRepo.createNotification.mockResolvedValue(mockNotification);

      const result = await service.create({
        eventId: mockNotification.eventId,
        ruleId: mockNotification.ruleId,
        templateId: 'tpl-order-confirm',
        channel: 'email',
      });

      expect(result).toEqual(mockNotification);
      expect(notificationsRepo.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDING' }),
      );
    });

    it('should create an initial PENDING status log entry', async () => {
      notificationsRepo.createNotification.mockResolvedValue(mockNotification);

      await service.create({
        eventId: mockNotification.eventId,
        ruleId: mockNotification.ruleId,
        templateId: 'tpl-order-confirm',
        channel: 'email',
      });

      expect(statusLogRepo.createLogEntry).toHaveBeenCalledWith(
        mockNotification.notificationId,
        null,
        'PENDING',
        'email',
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const result = {
        data: [mockNotification],
        total: 1,
        page: 1,
        limit: 50,
      };
      notificationsRepo.findWithFilters.mockResolvedValue(result);

      const response = await service.findAll({ page: 1, limit: 50 });

      expect(response).toEqual(result);
    });

    it('should pass all filters to repository', async () => {
      const result = { data: [], total: 0, page: 1, limit: 50 };
      notificationsRepo.findWithFilters.mockResolvedValue(result);

      await service.findAll({
        status: 'PENDING',
        channel: 'email',
        eventType: 'order.created',
        ruleId: 'rule-1',
        recipientEmail: 'test@example.com',
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
        page: 1,
        limit: 25,
      });

      expect(notificationsRepo.findWithFilters).toHaveBeenCalledWith({
        status: 'PENDING',
        channel: 'email',
        eventType: 'order.created',
        ruleId: 'rule-1',
        recipientEmail: 'test@example.com',
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
        page: 1,
        limit: 25,
      });
    });

    it('should pass undefined filters when not provided', async () => {
      const result = { data: [], total: 0, page: 1, limit: 50 };
      notificationsRepo.findWithFilters.mockResolvedValue(result);

      await service.findAll({ page: 2, limit: 10 });

      expect(notificationsRepo.findWithFilters).toHaveBeenCalledWith({
        status: undefined,
        channel: undefined,
        eventType: undefined,
        ruleId: undefined,
        recipientEmail: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        page: 2,
        limit: 10,
      });
    });
  });

  describe('findById', () => {
    it('should return notification with timeline and recipients', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        mockNotification,
      );

      const result = await service.findById(mockNotification.notificationId);

      expect(result.notification).toEqual(mockNotification);
      expect(result.timeline).toEqual([mockLogEntry]);
      expect(result.recipients).toEqual([mockRecipient]);
    });

    it('should throw NES-003 when notification not found', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(null);

      try {
        await service.findById('nonexistent');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-003');
      }
    });

    it('should fetch timeline and recipients in parallel', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        mockNotification,
      );

      await service.findById(mockNotification.notificationId);

      expect(statusLogRepo.findByNotificationId).toHaveBeenCalledWith(
        mockNotification.notificationId,
      );
      expect(recipientsRepo.findByNotificationId).toHaveBeenCalledWith(
        mockNotification.notificationId,
      );
    });
  });

  describe('getTimeline', () => {
    it('should return status log entries for a notification', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        mockNotification,
      );
      statusLogRepo.findByNotificationId.mockResolvedValue([mockLogEntry]);

      const result = await service.getTimeline(mockNotification.notificationId);

      expect(result).toEqual([mockLogEntry]);
    });

    it('should throw NES-003 when notification not found', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(null);

      try {
        await service.getTimeline('nonexistent');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-003');
      }
    });
  });

  describe('manualSend', () => {
    beforeEach(() => {
      notificationsRepo.createNotification.mockResolvedValue(mockNotification);
    });

    it('should create notifications for each channel+recipient and return result array', async () => {
      const result = await service.manualSend({
        templateId: 'tpl-order-confirm',
        channels: ['email', 'sms'],
        recipients: [{ email: 'test@example.com', name: 'Test' }],
      });

      expect(result).toHaveLength(2);
      expect(notificationsRepo.createNotification).toHaveBeenCalledTimes(2);
      expect(result[0]).toHaveProperty('notificationId');
      expect(result[0]).toHaveProperty('channel');
      expect(result[0]).toHaveProperty('status');
    });

    it('should render template and dispatch for each notification', async () => {
      await service.manualSend({
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipients: [{ email: 'test@example.com' }],
      });

      expect(templateClient.render).toHaveBeenCalledWith(
        'tpl-order-confirm',
        'email',
        {},
      );
      expect(publisher.publishToDeliver).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: mockNotification.notificationId,
          channel: 'email',
        }),
      );
    });

    it('should pass data to template render when provided', async () => {
      await service.manualSend({
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipients: [{ email: 'test@example.com' }],
        data: { orderId: '12345', amount: 99.99 },
      });

      expect(templateClient.render).toHaveBeenCalledWith(
        'tpl-order-confirm',
        'email',
        { orderId: '12345', amount: 99.99 },
      );
    });

    it('should transition through full lifecycle on success', async () => {
      await service.manualSend({
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipients: [{ email: 'test@example.com' }],
      });

      expect(lifecycleService.transition).toHaveBeenCalledWith(
        mockNotification.notificationId,
        'PROCESSING',
      );
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        mockNotification.notificationId,
        'RENDERING',
      );
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        mockNotification.notificationId,
        'DELIVERING',
      );
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        mockNotification.notificationId,
        'SENT',
      );
    });

    it('should return SENT status on success', async () => {
      const result = await service.manualSend({
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipients: [{ email: 'test@example.com' }],
      });

      expect(result[0].status).toBe('SENT');
    });

    it('should return FAILED status when template render fails', async () => {
      templateClient.render.mockRejectedValue(
        new Error('Template service unavailable'),
      );

      const result = await service.manualSend({
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipients: [{ email: 'test@example.com' }],
      });

      expect(result[0].status).toBe('FAILED');
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        mockNotification.notificationId,
        'FAILED',
        expect.objectContaining({
          errorMessage: expect.stringContaining('Template render failed'),
        }),
      );
      expect(publisher.publishToDeliver).not.toHaveBeenCalled();
    });

    it('should return FAILED status when dispatch fails', async () => {
      publisher.publishToDeliver.mockRejectedValue(
        new Error('RabbitMQ connection lost'),
      );

      const result = await service.manualSend({
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipients: [{ email: 'test@example.com' }],
      });

      expect(result[0].status).toBe('FAILED');
      expect(lifecycleService.transition).toHaveBeenCalledWith(
        mockNotification.notificationId,
        'FAILED',
        expect.objectContaining({
          errorMessage: expect.stringContaining('Dispatch failed'),
        }),
      );
    });

    it('should use default priority when not specified', async () => {
      await service.manualSend({
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipients: [{ email: 'test@example.com' }],
      });

      expect(notificationsRepo.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'normal' }),
      );
    });

    it('should use provided priority', async () => {
      await service.manualSend({
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipients: [{ email: 'test@example.com' }],
        priority: 'critical',
      });

      expect(notificationsRepo.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ priority: 'critical' }),
      );
    });

    it('should create recipients for each notification', async () => {
      await service.manualSend({
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipients: [{ email: 'test@example.com' }],
      });

      expect(recipientsRepo.createBatch).toHaveBeenCalledWith([
        expect.objectContaining({
          notificationId: mockNotification.notificationId,
          recipientType: 'custom',
          email: 'test@example.com',
        }),
      ]);
    });

    it('should track metrics for created notifications', async () => {
      await service.manualSend({
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipients: [{ email: 'test@example.com' }],
      });

      expect(metricsService.incrementNotificationsCreated).toHaveBeenCalledWith(
        'email',
        'normal',
      );
      expect(metricsService.incrementTemplateRender).toHaveBeenCalledWith(
        'email',
        'success',
      );
      expect(metricsService.incrementDispatched).toHaveBeenCalledWith(
        'email',
        'normal',
      );
    });
  });
});
