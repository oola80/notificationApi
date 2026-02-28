import {
  EXCHANGE_EVENTS_NORMALIZED,
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_NOTIFICATIONS_DLQ,
  QUEUE_AUDIT_EVENTS,
  QUEUE_AUDIT_DELIVER,
  QUEUE_STATUS_UPDATES,
  QUEUE_AUDIT_TEMPLATE,
  QUEUE_AUDIT_DLQ,
  CHANNEL_EVENTS,
  CHANNEL_DELIVER,
  CHANNEL_STATUS,
  CHANNEL_TEMPLATE,
  CHANNEL_DLQ,
  ALL_CONSUMED_QUEUES,
  extractProviderFromWebhookKey,
  isWebhookRoutingKey,
} from './rabbitmq.constants';

describe('RabbitMQ Constants', () => {
  describe('Exchange constants', () => {
    it('should define correct exchange names', () => {
      expect(EXCHANGE_EVENTS_NORMALIZED).toBe('xch.events.normalized');
      expect(EXCHANGE_NOTIFICATIONS_DELIVER).toBe('xch.notifications.deliver');
      expect(EXCHANGE_NOTIFICATIONS_STATUS).toBe('xch.notifications.status');
      expect(EXCHANGE_NOTIFICATIONS_DLQ).toBe('xch.notifications.dlq');
    });
  });

  describe('Queue constants', () => {
    it('should define correct queue names', () => {
      expect(QUEUE_AUDIT_EVENTS).toBe('audit.events');
      expect(QUEUE_AUDIT_DELIVER).toBe('audit.deliver');
      expect(QUEUE_STATUS_UPDATES).toBe('q.status.updates');
      expect(QUEUE_AUDIT_TEMPLATE).toBe('q.audit.template');
      expect(QUEUE_AUDIT_DLQ).toBe('audit.dlq');
    });
  });

  describe('Channel constants', () => {
    it('should define named channel identifiers', () => {
      expect(CHANNEL_EVENTS).toBe('channel-events');
      expect(CHANNEL_DELIVER).toBe('channel-deliver');
      expect(CHANNEL_STATUS).toBe('channel-status');
      expect(CHANNEL_TEMPLATE).toBe('channel-template');
      expect(CHANNEL_DLQ).toBe('channel-dlq');
    });
  });

  describe('ALL_CONSUMED_QUEUES', () => {
    it('should list all 5 consumed queues', () => {
      expect(ALL_CONSUMED_QUEUES).toHaveLength(5);
      expect(ALL_CONSUMED_QUEUES).toContain(QUEUE_AUDIT_EVENTS);
      expect(ALL_CONSUMED_QUEUES).toContain(QUEUE_AUDIT_DELIVER);
      expect(ALL_CONSUMED_QUEUES).toContain(QUEUE_STATUS_UPDATES);
      expect(ALL_CONSUMED_QUEUES).toContain(QUEUE_AUDIT_TEMPLATE);
      expect(ALL_CONSUMED_QUEUES).toContain(QUEUE_AUDIT_DLQ);
    });
  });

  describe('extractProviderFromWebhookKey', () => {
    it('should extract provider from webhook routing key', () => {
      expect(extractProviderFromWebhookKey('adapter.webhook.mailgun')).toBe(
        'adapter-mailgun',
      );
      expect(extractProviderFromWebhookKey('adapter.webhook.braze')).toBe(
        'adapter-braze',
      );
      expect(extractProviderFromWebhookKey('adapter.webhook.whatsapp')).toBe(
        'adapter-whatsapp',
      );
      expect(extractProviderFromWebhookKey('adapter.webhook.aws-ses')).toBe(
        'adapter-aws-ses',
      );
    });

    it('should return unknown-adapter for invalid routing keys', () => {
      expect(extractProviderFromWebhookKey('notification.status.sent')).toBe(
        'unknown-adapter',
      );
      expect(extractProviderFromWebhookKey('adapter.webhook')).toBe(
        'unknown-adapter',
      );
      expect(extractProviderFromWebhookKey('')).toBe('unknown-adapter');
    });
  });

  describe('isWebhookRoutingKey', () => {
    it('should return true for webhook routing keys', () => {
      expect(isWebhookRoutingKey('adapter.webhook.mailgun')).toBe(true);
      expect(isWebhookRoutingKey('adapter.webhook.braze')).toBe(true);
    });

    it('should return false for non-webhook routing keys', () => {
      expect(isWebhookRoutingKey('notification.status.sent')).toBe(false);
      expect(isWebhookRoutingKey('template.created')).toBe(false);
      expect(isWebhookRoutingKey('')).toBe(false);
    });
  });
});
