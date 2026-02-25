import {
  EXCHANGE_EVENTS_NORMALIZED,
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_NOTIFICATIONS_DLQ,
  EXCHANGE_CONFIG_EVENTS,
  QUEUE_ENGINE_EVENTS_CRITICAL,
  QUEUE_ENGINE_EVENTS_NORMAL,
  QUEUE_CONFIG_RULE_CACHE,
  QUEUE_CONFIG_OVERRIDE_CACHE,
  QUEUE_ENGINE_STATUS_INBOUND,
  deliverRoutingKey,
  statusRoutingKey,
  parseNormalizedRoutingKey,
} from './rabbitmq.constants.js';

describe('RabbitMQ Constants', () => {
  describe('Exchange constants', () => {
    it('should define EXCHANGE_EVENTS_NORMALIZED', () => {
      expect(EXCHANGE_EVENTS_NORMALIZED).toBe('xch.events.normalized');
    });

    it('should define EXCHANGE_NOTIFICATIONS_DELIVER', () => {
      expect(EXCHANGE_NOTIFICATIONS_DELIVER).toBe('xch.notifications.deliver');
    });

    it('should define EXCHANGE_NOTIFICATIONS_STATUS', () => {
      expect(EXCHANGE_NOTIFICATIONS_STATUS).toBe('xch.notifications.status');
    });

    it('should define EXCHANGE_NOTIFICATIONS_DLQ', () => {
      expect(EXCHANGE_NOTIFICATIONS_DLQ).toBe('xch.notifications.dlq');
    });

    it('should define EXCHANGE_CONFIG_EVENTS', () => {
      expect(EXCHANGE_CONFIG_EVENTS).toBe('xch.config.events');
    });
  });

  describe('Queue constants', () => {
    it('should define QUEUE_ENGINE_EVENTS_CRITICAL', () => {
      expect(QUEUE_ENGINE_EVENTS_CRITICAL).toBe('q.engine.events.critical');
    });

    it('should define QUEUE_ENGINE_EVENTS_NORMAL', () => {
      expect(QUEUE_ENGINE_EVENTS_NORMAL).toBe('q.engine.events.normal');
    });

    it('should define QUEUE_CONFIG_RULE_CACHE', () => {
      expect(QUEUE_CONFIG_RULE_CACHE).toBe('q.config.rule-cache');
    });

    it('should define QUEUE_CONFIG_OVERRIDE_CACHE', () => {
      expect(QUEUE_CONFIG_OVERRIDE_CACHE).toBe('q.config.override-cache');
    });

    it('should define QUEUE_ENGINE_STATUS_INBOUND', () => {
      expect(QUEUE_ENGINE_STATUS_INBOUND).toBe('q.engine.status.inbound');
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
    it('should build routing key for delivered', () => {
      expect(statusRoutingKey('delivered')).toBe(
        'notification.status.delivered',
      );
    });

    it('should build routing key for failed', () => {
      expect(statusRoutingKey('failed')).toBe('notification.status.failed');
    });

    it('should build routing key for processing', () => {
      expect(statusRoutingKey('processing')).toBe(
        'notification.status.processing',
      );
    });
  });

  describe('parseNormalizedRoutingKey', () => {
    it('should parse valid routing key', () => {
      const result = parseNormalizedRoutingKey('event.critical.order.created');
      expect(result).toEqual({
        priority: 'critical',
        eventType: 'order.created',
      });
    });

    it('should parse normal priority routing key', () => {
      const result = parseNormalizedRoutingKey('event.normal.shipment.shipped');
      expect(result).toEqual({
        priority: 'normal',
        eventType: 'shipment.shipped',
      });
    });

    it('should handle simple event type', () => {
      const result = parseNormalizedRoutingKey('event.critical.alert');
      expect(result).toEqual({
        priority: 'critical',
        eventType: 'alert',
      });
    });

    it('should handle deeply nested event type', () => {
      const result = parseNormalizedRoutingKey(
        'event.normal.order.item.returned.refund',
      );
      expect(result).toEqual({
        priority: 'normal',
        eventType: 'order.item.returned.refund',
      });
    });

    it('should return null for invalid routing key (no event prefix)', () => {
      expect(parseNormalizedRoutingKey('source.webhook.order')).toBeNull();
    });

    it('should return null for too few parts', () => {
      expect(parseNormalizedRoutingKey('event.critical')).toBeNull();
    });

    it('should return null for single segment', () => {
      expect(parseNormalizedRoutingKey('event')).toBeNull();
    });
  });
});
