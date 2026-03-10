import { Test, TestingModule } from '@nestjs/testing';
import { WebhookEventType } from '@app/common';
import { WebhookNormalizerService } from './webhook-normalizer.service.js';
import type {
  BrazePostbackPayload,
  BrazeCurrentsEvent,
} from './interfaces/braze-webhook.interfaces.js';

function buildPostback(
  overrides: Partial<BrazePostbackPayload> = {},
): BrazePostbackPayload {
  return {
    event_type: 'users.messages.email.Delivery',
    dispatch_id: 'dispatch-123',
    external_user_id: 'ext-user-abc',
    email_address: 'user@example.com',
    timestamp: '2026-03-09T12:00:00Z',
    key_value_pairs: {
      notificationId: 'notif-001',
      correlationId: 'corr-002',
      cycleId: 'cycle-003',
    },
    ...overrides,
  };
}

function buildCurrentsEvent(
  overrides: Partial<BrazeCurrentsEvent> = {},
): BrazeCurrentsEvent {
  return {
    event_type: 'users.messages.email.Delivery',
    dispatch_id: 'dispatch-456',
    external_user_id: 'ext-user-def',
    email_address: 'currents@example.com',
    timestamp: 1741521600, // 2025-03-09T12:00:00Z in epoch seconds
    properties: {
      notificationId: 'notif-c001',
      correlationId: 'corr-c002',
      cycleId: 'cycle-c003',
    },
    ...overrides,
  };
}

describe('WebhookNormalizerService', () => {
  let service: WebhookNormalizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookNormalizerService],
    }).compile();

    service = module.get(WebhookNormalizerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('email event mappings (postback)', () => {
    it('should map email.Delivery to DELIVERED', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.email.Delivery' }),
      );
      expect(result).not.toBeNull();
      expect(result!.eventType).toBe(WebhookEventType.DELIVERED);
      expect(result!.rawStatus).toBe('users.messages.email.Delivery');
    });

    it('should map email.Bounce to BOUNCED', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.email.Bounce' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.BOUNCED);
    });

    it('should map email.SoftBounce to TEMP_FAIL', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.email.SoftBounce' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.TEMP_FAIL);
    });

    it('should map email.Open to OPENED', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.email.Open' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.OPENED);
    });

    it('should map email.Click to CLICKED', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.email.Click' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.CLICKED);
    });

    it('should map email.SpamReport to SPAM_COMPLAINT', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.email.SpamReport' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.SPAM_COMPLAINT);
    });

    it('should map email.Unsubscribe to UNSUBSCRIBED', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.email.Unsubscribe' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.UNSUBSCRIBED);
    });
  });

  describe('SMS event mappings (postback)', () => {
    it('should map sms.Delivery to DELIVERED', () => {
      const result = service.normalizePostback(
        buildPostback({
          event_type: 'users.messages.sms.Delivery',
          phone_number: '+50212345678',
          email_address: undefined,
        }),
      );
      expect(result!.eventType).toBe(WebhookEventType.DELIVERED);
      expect(result!.recipientAddress).toBe('+50212345678');
    });

    it('should map sms.Rejection to BOUNCED', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.sms.Rejection' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.BOUNCED);
    });

    it('should map sms.InboundReceive to RECEIVED', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.sms.InboundReceive' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.RECEIVED);
    });
  });

  describe('WhatsApp event mappings (postback)', () => {
    it('should map whatsapp.Send to SENT', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.whatsapp.Send' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.SENT);
    });

    it('should map whatsapp.Delivery to DELIVERED', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.whatsapp.Delivery' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.DELIVERED);
    });

    it('should map whatsapp.Read to READ', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.whatsapp.Read' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.READ);
    });

    it('should map whatsapp.Failure to FAILED', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.whatsapp.Failure' }),
      );
      expect(result!.eventType).toBe(WebhookEventType.FAILED);
    });
  });

  describe('Push event mappings (postback)', () => {
    it('should map pushnotification.Send to SENT', () => {
      const result = service.normalizePostback(
        buildPostback({
          event_type: 'users.messages.pushnotification.Send',
          device_id: 'device-token-abc',
          email_address: undefined,
        }),
      );
      expect(result!.eventType).toBe(WebhookEventType.SENT);
      expect(result!.recipientAddress).toBe('device-token-abc');
    });

    it('should map pushnotification.Open to OPENED', () => {
      const result = service.normalizePostback(
        buildPostback({
          event_type: 'users.messages.pushnotification.Open',
        }),
      );
      expect(result!.eventType).toBe(WebhookEventType.OPENED);
    });
  });

  describe('unknown event type handling', () => {
    it('should return null for unknown event types', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'users.messages.email.Unknown' }),
      );
      expect(result).toBeNull();
    });

    it('should return null for completely unrecognized event type', () => {
      const result = service.normalizePostback(
        buildPostback({ event_type: 'some.random.event' }),
      );
      expect(result).toBeNull();
    });
  });

  describe('field extraction (postback)', () => {
    it('should extract providerId as braze', () => {
      const result = service.normalizePostback(buildPostback());
      expect(result!.providerId).toBe('braze');
      expect(result!.providerName).toBe('Braze');
    });

    it('should extract dispatch_id as providerMessageId', () => {
      const result = service.normalizePostback(
        buildPostback({ dispatch_id: 'my-dispatch-id' }),
      );
      expect(result!.providerMessageId).toBe('my-dispatch-id');
    });

    it('should fall back to message_id when dispatch_id is missing', () => {
      const result = service.normalizePostback(
        buildPostback({
          dispatch_id: undefined,
          message_id: 'fallback-msg-id',
        }),
      );
      expect(result!.providerMessageId).toBe('fallback-msg-id');
    });

    it('should extract email_address as recipientAddress for email events', () => {
      const result = service.normalizePostback(
        buildPostback({ email_address: 'test@example.com' }),
      );
      expect(result!.recipientAddress).toBe('test@example.com');
    });

    it('should extract phone_number as recipientAddress when no email', () => {
      const result = service.normalizePostback(
        buildPostback({
          email_address: undefined,
          phone_number: '+15551234567',
        }),
      );
      expect(result!.recipientAddress).toBe('+15551234567');
    });

    it('should extract timestamp as ISO string', () => {
      const result = service.normalizePostback(
        buildPostback({ timestamp: '2026-03-09T12:00:00Z' }),
      );
      expect(result!.timestamp).toBe('2026-03-09T12:00:00.000Z');
    });

    it('should extract notificationId from key_value_pairs', () => {
      const result = service.normalizePostback(
        buildPostback({
          key_value_pairs: { notificationId: 'notif-from-kvp' },
        }),
      );
      expect(result!.notificationId).toBe('notif-from-kvp');
    });

    it('should extract notificationId from message_extras as fallback', () => {
      const result = service.normalizePostback(
        buildPostback({
          key_value_pairs: {},
          message_extras: { notificationId: 'notif-from-extras' },
        }),
      );
      expect(result!.notificationId).toBe('notif-from-extras');
    });

    it('should set notificationId to null when not present', () => {
      const result = service.normalizePostback(
        buildPostback({
          key_value_pairs: {},
          message_extras: {},
        }),
      );
      expect(result!.notificationId).toBeNull();
    });

    it('should include externalUserId in metadata', () => {
      const result = service.normalizePostback(
        buildPostback({ external_user_id: 'ext-123' }),
      );
      expect(result!.metadata.externalUserId).toBe('ext-123');
    });
  });

  describe('Currents event normalization', () => {
    it('should normalize a Currents event correctly', () => {
      const result = service.normalizeCurrentsEvent(buildCurrentsEvent());
      expect(result).not.toBeNull();
      expect(result!.providerId).toBe('braze');
      expect(result!.eventType).toBe(WebhookEventType.DELIVERED);
      expect(result!.providerMessageId).toBe('dispatch-456');
      expect(result!.recipientAddress).toBe('currents@example.com');
    });

    it('should convert Currents epoch timestamp to ISO string', () => {
      const result = service.normalizeCurrentsEvent(
        buildCurrentsEvent({ timestamp: 1741521600 }),
      );
      expect(result!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should extract notificationId from properties', () => {
      const result = service.normalizeCurrentsEvent(
        buildCurrentsEvent({
          properties: { notificationId: 'notif-currents' },
        }),
      );
      expect(result!.notificationId).toBe('notif-currents');
    });

    it('should return null for unknown Currents event type', () => {
      const result = service.normalizeCurrentsEvent(
        buildCurrentsEvent({ event_type: 'unknown.event.type' }),
      );
      expect(result).toBeNull();
    });

    it('should handle missing fields gracefully', () => {
      const result = service.normalizeCurrentsEvent({
        event_type: 'users.messages.email.Delivery',
      });
      expect(result).not.toBeNull();
      expect(result!.providerMessageId).toBe('');
      expect(result!.recipientAddress).toBe('');
      expect(result!.notificationId).toBeNull();
    });
  });
});
