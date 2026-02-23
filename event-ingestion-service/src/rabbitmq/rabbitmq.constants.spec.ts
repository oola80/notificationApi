import {
  incomingRoutingKey,
  normalizedRoutingKey,
  parseIncomingRoutingKey,
  EXCHANGE_EVENTS_INCOMING,
  EXCHANGE_EVENTS_NORMALIZED,
  EXCHANGE_NOTIFICATIONS_DLQ,
  EXCHANGE_CONFIG_EVENTS,
  QUEUE_EVENTS_AMQP,
  QUEUE_EVENTS_WEBHOOK,
  QUEUE_EVENTS_EMAIL_INGEST,
} from './rabbitmq.constants.js';

describe('RabbitMQ Constants', () => {
  describe('exchange constants', () => {
    it('should have correct exchange names', () => {
      expect(EXCHANGE_EVENTS_INCOMING).toBe('xch.events.incoming');
      expect(EXCHANGE_EVENTS_NORMALIZED).toBe('xch.events.normalized');
      expect(EXCHANGE_NOTIFICATIONS_DLQ).toBe('xch.notifications.dlq');
      expect(EXCHANGE_CONFIG_EVENTS).toBe('xch.config.events');
    });
  });

  describe('queue constants', () => {
    it('should have correct queue names', () => {
      expect(QUEUE_EVENTS_AMQP).toBe('q.events.amqp');
      expect(QUEUE_EVENTS_WEBHOOK).toBe('q.events.webhook');
      expect(QUEUE_EVENTS_EMAIL_INGEST).toBe('q.events.email-ingest');
    });
  });

  describe('incomingRoutingKey', () => {
    it('should build routing key with sourceId and eventType', () => {
      expect(incomingRoutingKey('shopify', 'order.created')).toBe(
        'source.shopify.order.created',
      );
    });

    it('should handle simple event types', () => {
      expect(incomingRoutingKey('webhook', 'test')).toBe('source.webhook.test');
    });
  });

  describe('normalizedRoutingKey', () => {
    it('should build routing key with priority and eventType', () => {
      expect(normalizedRoutingKey('critical', 'order.created')).toBe(
        'event.critical.order.created',
      );
    });

    it('should handle normal priority', () => {
      expect(normalizedRoutingKey('normal', 'user.updated')).toBe(
        'event.normal.user.updated',
      );
    });
  });

  describe('parseIncomingRoutingKey', () => {
    it('should parse a valid routing key', () => {
      const result = parseIncomingRoutingKey('source.shopify.order.created');
      expect(result).toEqual({
        sourceId: 'shopify',
        eventType: 'order.created',
      });
    });

    it('should handle multi-segment event types', () => {
      const result = parseIncomingRoutingKey(
        'source.erp.inventory.item.updated',
      );
      expect(result).toEqual({
        sourceId: 'erp',
        eventType: 'inventory.item.updated',
      });
    });

    it('should handle simple event types', () => {
      const result = parseIncomingRoutingKey('source.webhook.test');
      expect(result).toEqual({
        sourceId: 'webhook',
        eventType: 'test',
      });
    });

    it('should throw on invalid format — missing source prefix', () => {
      expect(() => parseIncomingRoutingKey('invalid.key')).toThrow(
        'Invalid incoming routing key format',
      );
    });

    it('should throw on invalid format — too few segments', () => {
      expect(() => parseIncomingRoutingKey('source.only')).toThrow(
        'Invalid incoming routing key format',
      );
    });

    it('should throw on empty string', () => {
      expect(() => parseIncomingRoutingKey('')).toThrow(
        'Invalid incoming routing key format',
      );
    });
  });
});
