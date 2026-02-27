import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  webhookRoutingKey,
} from './rabbitmq.constants.js';

describe('RabbitMQ Constants', () => {
  it('should have the correct exchange name', () => {
    expect(EXCHANGE_NOTIFICATIONS_STATUS).toBe('xch.notifications.status');
  });

  it('should build webhook routing key', () => {
    expect(webhookRoutingKey('mailgun')).toBe('adapter.webhook.mailgun');
    expect(webhookRoutingKey('braze')).toBe('adapter.webhook.braze');
    expect(webhookRoutingKey('whatsapp')).toBe('adapter.webhook.whatsapp');
    expect(webhookRoutingKey('aws-ses')).toBe('adapter.webhook.aws-ses');
  });
});
