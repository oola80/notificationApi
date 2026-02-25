import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { HttpException } from '@nestjs/common';
import { NotificationPublisherService } from './notification-publisher.service.js';
import { DeliverMessage } from './interfaces/deliver-message.interface.js';
import {
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_CONFIG_EVENTS,
} from './rabbitmq.constants.js';

describe('NotificationPublisherService', () => {
  let service: NotificationPublisherService;
  let amqpConnection: jest.Mocked<AmqpConnection>;

  const mockDeliverMessage: DeliverMessage = {
    notificationId: '550e8400-e29b-41d4-a716-446655440000',
    eventId: '660e8400-e29b-41d4-a716-446655440001',
    ruleId: '770e8400-e29b-41d4-a716-446655440002',
    channel: 'email',
    priority: 'critical',
    recipient: {
      email: 'test@example.com',
      name: 'Test User',
      customerId: 'cust-1',
    },
    content: {
      subject: 'Order Confirmed',
      body: '<p>Your order has been confirmed</p>',
      templateVersion: 3,
    },
    metadata: {
      correlationId: 'corr-123',
      eventType: 'order.created',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPublisherService,
        {
          provide: AmqpConnection,
          useValue: {
            publish: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationPublisherService>(
      NotificationPublisherService,
    );
    amqpConnection = module.get(AmqpConnection);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publishToDeliver', () => {
    it('should publish message to deliver exchange with correct routing key', async () => {
      await service.publishToDeliver(mockDeliverMessage);

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_DELIVER,
        'notification.deliver.critical.email',
        mockDeliverMessage,
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
          messageId: '550e8400-e29b-41d4-a716-446655440000',
          correlationId: 'corr-123',
          headers: {
            'x-channel': 'email',
            'x-priority': 'critical',
            'x-event-type': 'order.created',
          },
        }),
      );
    });

    it('should throw NES-016 when publish fails', async () => {
      amqpConnection.publish.mockRejectedValue(new Error('Connection lost'));

      try {
        await service.publishToDeliver(mockDeliverMessage);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-016');
      }
    });

    it('should use normal priority routing key', async () => {
      const normalMessage = {
        ...mockDeliverMessage,
        priority: 'normal',
        channel: 'sms',
      };
      await service.publishToDeliver(normalMessage);

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_DELIVER,
        'notification.deliver.normal.sms',
        normalMessage,
        expect.any(Object),
      );
    });
  });

  describe('publishStatus', () => {
    it('should publish status transition to status exchange', () => {
      service.publishStatus('notif-1', 'PENDING', 'PROCESSING', 'email', {
        reason: 'event received',
      });

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_STATUS,
        'notification.status.processing',
        expect.objectContaining({
          notificationId: 'notif-1',
          fromStatus: 'PENDING',
          toStatus: 'PROCESSING',
          channel: 'email',
          metadata: { reason: 'event received' },
        }),
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
        }),
      );
    });

    it('should lowercase status in routing key', () => {
      service.publishStatus('notif-1', 'SENT', 'DELIVERED', 'sms');

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_STATUS,
        'notification.status.delivered',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should not throw when publish fails (fire-and-forget)', () => {
      amqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      expect(() =>
        service.publishStatus('notif-1', 'PENDING', 'PROCESSING', 'email'),
      ).not.toThrow();
    });

    it('should include timestamp in payload', () => {
      service.publishStatus('notif-1', 'PENDING', 'PROCESSING', 'email');

      const publishedPayload = (amqpConnection.publish as jest.Mock).mock
        .calls[0][2];
      expect(publishedPayload.timestamp).toBeDefined();
      expect(typeof publishedPayload.timestamp).toBe('string');
    });
  });

  describe('publishConfigEvent', () => {
    it('should publish config event to config exchange', () => {
      const payload = {
        ruleId: 'rule-1',
        timestamp: '2026-01-01',
        action: 'updated',
      };

      service.publishConfigEvent('config.rule.changed', payload);

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_CONFIG_EVENTS,
        'config.rule.changed',
        payload,
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
        }),
      );
    });

    it('should publish override config event', () => {
      const payload = { eventType: 'order.created', action: 'deleted' };

      service.publishConfigEvent('config.override.changed', payload);

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_CONFIG_EVENTS,
        'config.override.changed',
        payload,
        expect.any(Object),
      );
    });

    it('should not throw when publish fails (fire-and-forget)', () => {
      amqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      expect(() =>
        service.publishConfigEvent('config.rule.changed', { ruleId: '1' }),
      ).not.toThrow();
    });
  });
});
