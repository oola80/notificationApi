import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { RabbitMQPublisherService } from './rabbitmq-publisher.service.js';
import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_DLQ,
} from './rabbitmq.constants.js';

describe('RabbitMQPublisherService', () => {
  let service: RabbitMQPublisherService;
  let amqpConnection: jest.Mocked<AmqpConnection>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RabbitMQPublisherService,
        {
          provide: AmqpConnection,
          useValue: {
            publish: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<RabbitMQPublisherService>(RabbitMQPublisherService);
    amqpConnection = module.get(AmqpConnection);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publishDeliveryStatus', () => {
    it('should publish status to status exchange with correct routing key', () => {
      const payload = {
        notificationId: 'notif-1',
        fromStatus: 'DELIVERING',
        toStatus: 'SENT',
        channel: 'email',
        timestamp: new Date().toISOString(),
      };

      service.publishDeliveryStatus(payload);

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_STATUS,
        'notification.status.sent',
        payload,
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
        }),
      );
    });

    it('should lowercase the toStatus for routing key', () => {
      service.publishDeliveryStatus({
        notificationId: 'notif-1',
        fromStatus: 'DELIVERING',
        toStatus: 'FAILED',
        channel: 'sms',
        timestamp: new Date().toISOString(),
      });

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_STATUS,
        'notification.status.failed',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should not throw when publish fails (fire-and-forget)', () => {
      amqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      expect(() =>
        service.publishDeliveryStatus({
          notificationId: 'notif-1',
          fromStatus: 'DELIVERING',
          toStatus: 'SENT',
          channel: 'email',
          timestamp: new Date().toISOString(),
        }),
      ).not.toThrow();
    });
  });

  describe('publishDeliveryAttempt', () => {
    it('should publish attempt to status exchange with delivery-attempt routing key', () => {
      const payload = {
        notificationId: 'notif-1',
        channel: 'email',
        providerId: 'prov-1',
        providerName: 'sendgrid',
        attemptNumber: 1,
        outcome: 'sent',
        durationMs: 150,
        timestamp: new Date().toISOString(),
      };

      service.publishDeliveryAttempt(payload, 'sent');

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_STATUS,
        'channel-router.delivery-attempt.sent',
        payload,
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
        }),
      );
    });

    it('should not throw when publish fails (fire-and-forget)', () => {
      amqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      expect(() =>
        service.publishDeliveryAttempt(
          {
            notificationId: 'notif-1',
            channel: 'email',
            providerId: 'prov-1',
            providerName: 'sendgrid',
            attemptNumber: 1,
            outcome: 'failed',
            durationMs: 150,
            timestamp: new Date().toISOString(),
          },
          'failed',
        ),
      ).not.toThrow();
    });
  });

  describe('publishToDlq', () => {
    it('should publish to DLQ exchange with empty routing key', () => {
      const message = { notificationId: 'notif-1', channel: 'email' };
      const metadata = { notificationId: 'notif-1', reason: 'Max retries' };

      service.publishToDlq(message, metadata);

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_DLQ,
        '',
        expect.objectContaining({
          originalMessage: message,
          metadata,
        }),
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
        }),
      );
    });

    it('should not throw when publish fails (fire-and-forget)', () => {
      amqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      expect(() =>
        service.publishToDlq({}, { notificationId: 'notif-1' }),
      ).not.toThrow();
    });
  });

  describe('publishFallbackDispatch', () => {
    it('should publish to deliver exchange with correct routing key', () => {
      const message = {
        notificationId: 'notif-1',
        channel: 'sms',
        priority: 'critical',
      };

      service.publishFallbackDispatch(message);

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_DELIVER,
        'notification.deliver.critical.sms',
        message,
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
          headers: expect.objectContaining({
            'x-fallback': 'true',
          }),
        }),
      );
    });

    it('should default to normal priority', () => {
      const message = { notificationId: 'notif-1', channel: 'email' };

      service.publishFallbackDispatch(message);

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_DELIVER,
        'notification.deliver.normal.email',
        message,
        expect.any(Object),
      );
    });

    it('should not throw when publish fails (fire-and-forget)', () => {
      amqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      expect(() =>
        service.publishFallbackDispatch({
          notificationId: 'notif-1',
          channel: 'email',
        }),
      ).not.toThrow();
    });
  });

  describe('republishForRetry', () => {
    it('should publish to specified exchange with headers', async () => {
      await service.republishForRetry(
        EXCHANGE_NOTIFICATIONS_DELIVER,
        'notification.deliver.critical.email',
        { notificationId: 'notif-1' },
        { 'x-attempt': '2' },
      );

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_DELIVER,
        'notification.deliver.critical.email',
        { notificationId: 'notif-1' },
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
          headers: expect.objectContaining({
            'x-attempt': '2',
            'x-retry-at': expect.any(String),
          }),
        }),
      );
    });

    it('should throw when publish fails (async method)', async () => {
      amqpConnection.publish.mockRejectedValue(new Error('Connection lost'));

      await expect(
        service.republishForRetry(
          EXCHANGE_NOTIFICATIONS_DELIVER,
          'some.key',
          {},
        ),
      ).rejects.toThrow('Connection lost');
    });
  });
});
