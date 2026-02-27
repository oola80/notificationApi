import { WebhookEventDto, WebhookEventType } from './webhook-event.dto.js';

describe('WebhookEventDto', () => {
  it('should create a valid WebhookEventDto', () => {
    const dto = new WebhookEventDto();
    dto.providerId = 'mailgun';
    dto.providerName = 'Mailgun';
    dto.providerMessageId = 'msg-123';
    dto.eventType = WebhookEventType.DELIVERED;
    dto.rawStatus = 'delivered';
    dto.notificationId = 'notif-456';
    dto.correlationId = 'corr-789';
    dto.cycleId = 'cycle-000';
    dto.recipientAddress = 'user@example.com';
    dto.timestamp = new Date().toISOString();
    dto.metadata = { key: 'value' };

    expect(dto.providerId).toBe('mailgun');
    expect(dto.eventType).toBe(WebhookEventType.DELIVERED);
  });
});

describe('WebhookEventType', () => {
  it('should have all expected event types', () => {
    expect(WebhookEventType.DELIVERED).toBe('delivered');
    expect(WebhookEventType.OPENED).toBe('opened');
    expect(WebhookEventType.CLICKED).toBe('clicked');
    expect(WebhookEventType.BOUNCED).toBe('bounced');
    expect(WebhookEventType.FAILED).toBe('failed');
    expect(WebhookEventType.COMPLAINED).toBe('complained');
    expect(WebhookEventType.UNSUBSCRIBED).toBe('unsubscribed');
  });
});
