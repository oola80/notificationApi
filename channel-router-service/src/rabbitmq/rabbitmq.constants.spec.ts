import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_DLQ,
  QUEUE_DELIVER_EMAIL_CRITICAL,
  QUEUE_DELIVER_EMAIL_NORMAL,
  QUEUE_DELIVER_SMS_CRITICAL,
  QUEUE_DELIVER_SMS_NORMAL,
  QUEUE_DELIVER_WHATSAPP_CRITICAL,
  QUEUE_DELIVER_WHATSAPP_NORMAL,
  QUEUE_DELIVER_PUSH_CRITICAL,
  QUEUE_DELIVER_PUSH_NORMAL,
  deliverRoutingKey,
  statusRoutingKey,
  deliveryAttemptRoutingKey,
} from './rabbitmq.constants.js';

describe('RabbitMQ Constants', () => {
  describe('Exchange constants', () => {
    it('should define EXCHANGE_NOTIFICATIONS_STATUS', () => {
      expect(EXCHANGE_NOTIFICATIONS_STATUS).toBe('xch.notifications.status');
    });

    it('should define EXCHANGE_NOTIFICATIONS_DELIVER', () => {
      expect(EXCHANGE_NOTIFICATIONS_DELIVER).toBe('xch.notifications.deliver');
    });

    it('should define EXCHANGE_NOTIFICATIONS_DLQ', () => {
      expect(EXCHANGE_NOTIFICATIONS_DLQ).toBe('xch.notifications.dlq');
    });
  });

  describe('Queue constants', () => {
    it('should define all 8 delivery queues', () => {
      expect(QUEUE_DELIVER_EMAIL_CRITICAL).toBe('q.deliver.email.critical');
      expect(QUEUE_DELIVER_EMAIL_NORMAL).toBe('q.deliver.email.normal');
      expect(QUEUE_DELIVER_SMS_CRITICAL).toBe('q.deliver.sms.critical');
      expect(QUEUE_DELIVER_SMS_NORMAL).toBe('q.deliver.sms.normal');
      expect(QUEUE_DELIVER_WHATSAPP_CRITICAL).toBe(
        'q.deliver.whatsapp.critical',
      );
      expect(QUEUE_DELIVER_WHATSAPP_NORMAL).toBe('q.deliver.whatsapp.normal');
      expect(QUEUE_DELIVER_PUSH_CRITICAL).toBe('q.deliver.push.critical');
      expect(QUEUE_DELIVER_PUSH_NORMAL).toBe('q.deliver.push.normal');
    });
  });

  describe('deliverRoutingKey', () => {
    it('should build routing key for critical email', () => {
      expect(deliverRoutingKey('critical', 'email')).toBe(
        'notification.deliver.critical.email',
      );
    });

    it('should build routing key for normal sms', () => {
      expect(deliverRoutingKey('normal', 'sms')).toBe(
        'notification.deliver.normal.sms',
      );
    });

    it('should build routing key for critical push', () => {
      expect(deliverRoutingKey('critical', 'push')).toBe(
        'notification.deliver.critical.push',
      );
    });

    it('should build routing key for normal whatsapp', () => {
      expect(deliverRoutingKey('normal', 'whatsapp')).toBe(
        'notification.deliver.normal.whatsapp',
      );
    });
  });

  describe('statusRoutingKey', () => {
    it('should build routing key for sent', () => {
      expect(statusRoutingKey('sent')).toBe('notification.status.sent');
    });

    it('should build routing key for failed', () => {
      expect(statusRoutingKey('failed')).toBe('notification.status.failed');
    });

    it('should build routing key for delivered', () => {
      expect(statusRoutingKey('delivered')).toBe(
        'notification.status.delivered',
      );
    });
  });

  describe('deliveryAttemptRoutingKey', () => {
    it('should build routing key for sent outcome', () => {
      expect(deliveryAttemptRoutingKey('sent')).toBe(
        'channel-router.delivery-attempt.sent',
      );
    });

    it('should build routing key for failed outcome', () => {
      expect(deliveryAttemptRoutingKey('failed')).toBe(
        'channel-router.delivery-attempt.failed',
      );
    });

    it('should build routing key for retrying outcome', () => {
      expect(deliveryAttemptRoutingKey('retrying')).toBe(
        'channel-router.delivery-attempt.retrying',
      );
    });
  });
});
