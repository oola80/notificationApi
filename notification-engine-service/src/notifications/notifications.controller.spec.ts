import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { Notification } from './entities/notification.entity.js';
import { NotificationStatusLog } from './entities/notification-status-log.entity.js';
import { NotificationRecipient } from './entities/notification-recipient.entity.js';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let service: jest.Mocked<NotificationsService>;

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
  };

  const mockLogEntry: NotificationStatusLog = {
    id: '1',
    notificationId: '550e8400-e29b-41d4-a716-446655440000',
    fromStatus: null,
    toStatus: 'PENDING',
    channel: 'email',
    metadata: null,
    createdAt: new Date(),
  };

  const mockRecipient: NotificationRecipient = {
    id: '1',
    notificationId: '550e8400-e29b-41d4-a716-446655440000',
    recipientType: 'customer',
    email: 'test@example.com',
    phone: null,
    deviceToken: null,
    memberName: null,
    status: 'PENDING',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const mockService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      getTimeline: jest.fn(),
      manualSend: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockService }],
    }).compile();

    controller = module.get<NotificationsController>(NotificationsController);
    service = module.get(NotificationsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should delegate to service.findAll with query params', async () => {
      const result = {
        data: [mockNotification],
        total: 1,
        page: 1,
        limit: 50,
      };
      service.findAll.mockResolvedValue(result);

      const query = { page: 1, limit: 50 };
      expect(await controller.findAll(query)).toEqual(result);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });

    it('should pass filter params to service', async () => {
      const result = { data: [], total: 0, page: 1, limit: 50 };
      service.findAll.mockResolvedValue(result);

      const query = {
        status: 'PENDING',
        channel: 'email',
        page: 1,
        limit: 50,
      };
      await controller.findAll(query);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findById', () => {
    it('should delegate to service.findById', async () => {
      const result = {
        notification: mockNotification,
        timeline: [mockLogEntry],
        recipients: [mockRecipient],
      };
      service.findById.mockResolvedValue(result);

      expect(
        await controller.findById(mockNotification.notificationId),
      ).toEqual(result);
      expect(service.findById).toHaveBeenCalledWith(
        mockNotification.notificationId,
      );
    });
  });

  describe('getTimeline', () => {
    it('should delegate to service.getTimeline', async () => {
      service.getTimeline.mockResolvedValue([mockLogEntry]);

      const result = await controller.getTimeline(
        mockNotification.notificationId,
      );

      expect(result).toEqual([mockLogEntry]);
      expect(service.getTimeline).toHaveBeenCalledWith(
        mockNotification.notificationId,
      );
    });
  });

  describe('manualSend', () => {
    it('should delegate to service.manualSend', async () => {
      service.manualSend.mockResolvedValue([mockNotification]);

      const dto = {
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipients: [{ email: 'test@example.com' }],
      };

      const result = await controller.manualSend(dto);

      expect(result).toEqual([mockNotification]);
      expect(service.manualSend).toHaveBeenCalledWith(dto);
    });
  });
});
