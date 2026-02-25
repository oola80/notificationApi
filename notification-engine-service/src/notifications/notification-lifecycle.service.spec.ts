import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import {
  NotificationLifecycleService,
  VALID_TRANSITIONS,
  TERMINAL_STATUSES,
} from './notification-lifecycle.service.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationStatusLogRepository } from './notification-status-log.repository.js';
import { Notification } from './entities/notification.entity.js';

describe('NotificationLifecycleService', () => {
  let service: NotificationLifecycleService;
  let notificationsRepo: jest.Mocked<NotificationsRepository>;
  let statusLogRepo: jest.Mocked<NotificationStatusLogRepository>;

  const createMockNotification = (status: string): Notification =>
    ({
      id: '1',
      notificationId: '550e8400-e29b-41d4-a716-446655440000',
      eventId: '660e8400-e29b-41d4-a716-446655440001',
      ruleId: '770e8400-e29b-41d4-a716-446655440002',
      templateId: 'tpl-order-confirm',
      templateVersion: null,
      channel: 'email',
      status,
      priority: 'normal',
      recipientEmail: 'test@example.com',
      recipientPhone: null,
      recipientName: null,
      customerId: null,
      dedupKeyHash: null,
      dedupKeyValues: null,
      renderedContent: null,
      correlationId: null,
      cycleId: null,
      sourceId: null,
      eventType: 'order.created',
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as Notification;

  beforeEach(async () => {
    const mockNotificationsRepo = {
      findByNotificationId: jest.fn(),
      updateStatus: jest.fn(),
    };

    const mockStatusLogRepo = {
      createLogEntry: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationLifecycleService,
        { provide: NotificationsRepository, useValue: mockNotificationsRepo },
        {
          provide: NotificationStatusLogRepository,
          useValue: mockStatusLogRepo,
        },
      ],
    }).compile();

    service = module.get<NotificationLifecycleService>(
      NotificationLifecycleService,
    );
    notificationsRepo = module.get(NotificationsRepository);
    statusLogRepo = module.get(NotificationStatusLogRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('VALID_TRANSITIONS', () => {
    it('should define PENDING → PROCESSING', () => {
      expect(VALID_TRANSITIONS['PENDING']).toContain('PROCESSING');
    });

    it('should define PROCESSING → SUPPRESSED, RENDERING, FAILED', () => {
      expect(VALID_TRANSITIONS['PROCESSING']).toEqual(
        expect.arrayContaining(['SUPPRESSED', 'RENDERING', 'FAILED']),
      );
    });

    it('should define RENDERING → DELIVERING, FAILED', () => {
      expect(VALID_TRANSITIONS['RENDERING']).toEqual(
        expect.arrayContaining(['DELIVERING', 'FAILED']),
      );
    });

    it('should define DELIVERING → SENT, FAILED', () => {
      expect(VALID_TRANSITIONS['DELIVERING']).toEqual(
        expect.arrayContaining(['SENT', 'FAILED']),
      );
    });

    it('should define SENT → DELIVERED, FAILED', () => {
      expect(VALID_TRANSITIONS['SENT']).toEqual(
        expect.arrayContaining(['DELIVERED', 'FAILED']),
      );
    });

    it('should not define transitions from terminal statuses', () => {
      expect(VALID_TRANSITIONS['SUPPRESSED']).toBeUndefined();
      expect(VALID_TRANSITIONS['DELIVERED']).toBeUndefined();
      expect(VALID_TRANSITIONS['FAILED']).toBeUndefined();
    });
  });

  describe('TERMINAL_STATUSES', () => {
    it('should include SUPPRESSED, DELIVERED, FAILED', () => {
      expect(TERMINAL_STATUSES).toEqual(
        expect.arrayContaining(['SUPPRESSED', 'DELIVERED', 'FAILED']),
      );
    });
  });

  describe('transition', () => {
    it('should transition PENDING → PROCESSING', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        createMockNotification('PENDING'),
      );
      notificationsRepo.updateStatus.mockResolvedValue(undefined);

      await service.transition(
        '550e8400-e29b-41d4-a716-446655440000',
        'PROCESSING',
      );

      expect(notificationsRepo.updateStatus).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'PROCESSING',
        undefined,
      );
    });

    it('should transition PROCESSING → RENDERING', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        createMockNotification('PROCESSING'),
      );
      notificationsRepo.updateStatus.mockResolvedValue(undefined);

      await service.transition(
        '550e8400-e29b-41d4-a716-446655440000',
        'RENDERING',
      );

      expect(notificationsRepo.updateStatus).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'RENDERING',
        undefined,
      );
    });

    it('should transition PROCESSING → SUPPRESSED', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        createMockNotification('PROCESSING'),
      );
      notificationsRepo.updateStatus.mockResolvedValue(undefined);

      await service.transition(
        '550e8400-e29b-41d4-a716-446655440000',
        'SUPPRESSED',
      );

      expect(notificationsRepo.updateStatus).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'SUPPRESSED',
        undefined,
      );
    });

    it('should transition RENDERING → DELIVERING', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        createMockNotification('RENDERING'),
      );
      notificationsRepo.updateStatus.mockResolvedValue(undefined);

      await service.transition(
        '550e8400-e29b-41d4-a716-446655440000',
        'DELIVERING',
      );

      expect(notificationsRepo.updateStatus).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'DELIVERING',
        undefined,
      );
    });

    it('should transition DELIVERING → SENT', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        createMockNotification('DELIVERING'),
      );
      notificationsRepo.updateStatus.mockResolvedValue(undefined);

      await service.transition('550e8400-e29b-41d4-a716-446655440000', 'SENT');

      expect(notificationsRepo.updateStatus).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'SENT',
        undefined,
      );
    });

    it('should transition SENT → DELIVERED', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        createMockNotification('SENT'),
      );
      notificationsRepo.updateStatus.mockResolvedValue(undefined);

      await service.transition(
        '550e8400-e29b-41d4-a716-446655440000',
        'DELIVERED',
      );

      expect(notificationsRepo.updateStatus).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'DELIVERED',
        undefined,
      );
    });

    it('should transition any valid state → FAILED', async () => {
      for (const fromStatus of [
        'PROCESSING',
        'RENDERING',
        'DELIVERING',
        'SENT',
      ]) {
        notificationsRepo.findByNotificationId.mockResolvedValue(
          createMockNotification(fromStatus),
        );
        notificationsRepo.updateStatus.mockResolvedValue(undefined);

        await service.transition(
          '550e8400-e29b-41d4-a716-446655440000',
          'FAILED',
          { errorMessage: 'Something went wrong' },
        );

        expect(notificationsRepo.updateStatus).toHaveBeenCalledWith(
          '550e8400-e29b-41d4-a716-446655440000',
          'FAILED',
          'Something went wrong',
        );
      }
    });

    it('should create a status log entry asynchronously', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        createMockNotification('PENDING'),
      );
      notificationsRepo.updateStatus.mockResolvedValue(undefined);

      await service.transition(
        '550e8400-e29b-41d4-a716-446655440000',
        'PROCESSING',
        { reason: 'event received' },
      );

      // Allow microtask to complete
      await new Promise((resolve) => setImmediate(resolve));

      expect(statusLogRepo.createLogEntry).toHaveBeenCalledWith(
        '550e8400-e29b-41d4-a716-446655440000',
        'PENDING',
        'PROCESSING',
        'email',
        { reason: 'event received' },
      );
    });

    it('should throw NES-003 when notification not found', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(null);

      try {
        await service.transition('nonexistent', 'PROCESSING');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-003');
      }
    });

    it('should throw NES-015 for PENDING → DELIVERED (invalid)', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        createMockNotification('PENDING'),
      );

      try {
        await service.transition(
          '550e8400-e29b-41d4-a716-446655440000',
          'DELIVERED',
        );
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-015');
        expect(response.message).toContain('PENDING');
        expect(response.message).toContain('DELIVERED');
      }
    });

    it('should throw NES-015 for PENDING → SUPPRESSED (invalid)', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        createMockNotification('PENDING'),
      );

      try {
        await service.transition(
          '550e8400-e29b-41d4-a716-446655440000',
          'SUPPRESSED',
        );
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-015');
      }
    });

    it('should throw NES-015 for terminal status transitions', async () => {
      for (const terminalStatus of ['SUPPRESSED', 'DELIVERED', 'FAILED']) {
        notificationsRepo.findByNotificationId.mockResolvedValue(
          createMockNotification(terminalStatus),
        );

        try {
          await service.transition(
            '550e8400-e29b-41d4-a716-446655440000',
            'PROCESSING',
          );
          fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(HttpException);
          const response = (error as HttpException).getResponse() as any;
          expect(response.code).toBe('NES-015');
        }
      }
    });

    it('should throw NES-015 for RENDERING → SENT (must go through DELIVERING)', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        createMockNotification('RENDERING'),
      );

      try {
        await service.transition(
          '550e8400-e29b-41d4-a716-446655440000',
          'SENT',
        );
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-015');
      }
    });

    it('should not throw when status log creation fails', async () => {
      notificationsRepo.findByNotificationId.mockResolvedValue(
        createMockNotification('PENDING'),
      );
      notificationsRepo.updateStatus.mockResolvedValue(undefined);
      statusLogRepo.createLogEntry.mockRejectedValue(
        new Error('DB connection lost'),
      );

      // Should not throw — status log is fire-and-forget
      await service.transition(
        '550e8400-e29b-41d4-a716-446655440000',
        'PROCESSING',
      );

      expect(notificationsRepo.updateStatus).toHaveBeenCalled();
    });
  });
});
