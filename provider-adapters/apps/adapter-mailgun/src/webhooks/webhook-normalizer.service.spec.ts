import { Test, TestingModule } from '@nestjs/testing';
import { WebhookEventType } from '@app/common';
import { WebhookNormalizerService } from './webhook-normalizer.service.js';
import { MailgunWebhookPayload } from './interfaces/mailgun-webhook.interfaces.js';

function buildPayload(
  overrides: Partial<{
    event: string;
    severity: string;
    reason: string;
    messageId: string;
    recipient: string;
    timestamp: number;
    userVariables: Record<string, string>;
    deliveryStatus: { code: number; message: string; description: string };
    ip: string;
    url: string;
    geolocation: Record<string, any>;
  }> = {},
): MailgunWebhookPayload {
  return {
    signature: {
      timestamp: '1706745600',
      token: 'test-token',
      signature: 'test-sig',
    },
    'event-data': {
      event: overrides.event ?? 'delivered',
      id: 'event-id-123',
      timestamp: overrides.timestamp ?? 1706745600,
      severity: overrides.severity,
      reason: overrides.reason,
      message: {
        headers: {
          'message-id':
            overrides.messageId ?? '<abc123@distelsa.info>',
          to: 'user@example.com',
          from: 'notifications@distelsa.info',
          subject: 'Test Email',
        },
      },
      recipient: overrides.recipient ?? 'user@example.com',
      'user-variables': overrides.userVariables ?? {
        notificationId: 'notif-001',
        correlationId: 'corr-002',
        cycleId: 'cycle-003',
      },
      'delivery-status': overrides.deliveryStatus,
      ip: overrides.ip,
      url: overrides.url,
      geolocation: overrides.geolocation,
    },
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

  describe('event type mapping', () => {
    it('should map "delivered" → DELIVERED', () => {
      const result = service.normalize(buildPayload({ event: 'delivered' }));
      expect(result.eventType).toBe(WebhookEventType.DELIVERED);
    });

    it('should map "opened" → OPENED', () => {
      const result = service.normalize(buildPayload({ event: 'opened' }));
      expect(result.eventType).toBe(WebhookEventType.OPENED);
    });

    it('should map "clicked" → CLICKED', () => {
      const result = service.normalize(buildPayload({ event: 'clicked' }));
      expect(result.eventType).toBe(WebhookEventType.CLICKED);
    });

    it('should map "failed" with severity "permanent" → BOUNCED', () => {
      const result = service.normalize(
        buildPayload({ event: 'failed', severity: 'permanent' }),
      );
      expect(result.eventType).toBe(WebhookEventType.BOUNCED);
    });

    it('should map "failed" with severity "temporary" → FAILED', () => {
      const result = service.normalize(
        buildPayload({ event: 'failed', severity: 'temporary' }),
      );
      expect(result.eventType).toBe(WebhookEventType.FAILED);
    });

    it('should map "failed" without severity → FAILED', () => {
      const result = service.normalize(
        buildPayload({ event: 'failed' }),
      );
      expect(result.eventType).toBe(WebhookEventType.FAILED);
    });

    it('should map "complained" → COMPLAINED', () => {
      const result = service.normalize(
        buildPayload({ event: 'complained' }),
      );
      expect(result.eventType).toBe(WebhookEventType.COMPLAINED);
    });

    it('should map "unsubscribed" → UNSUBSCRIBED', () => {
      const result = service.normalize(
        buildPayload({ event: 'unsubscribed' }),
      );
      expect(result.eventType).toBe(WebhookEventType.UNSUBSCRIBED);
    });
  });

  describe('field extraction', () => {
    it('should extract custom variables from user-variables', () => {
      const result = service.normalize(
        buildPayload({
          userVariables: {
            notificationId: 'notif-abc',
            correlationId: 'corr-def',
            cycleId: 'cycle-ghi',
          },
        }),
      );
      expect(result.notificationId).toBe('notif-abc');
      expect(result.correlationId).toBe('corr-def');
      expect(result.cycleId).toBe('cycle-ghi');
    });

    it('should extract provider message ID with angle brackets', () => {
      const result = service.normalize(
        buildPayload({ messageId: '<xyz789@distelsa.info>' }),
      );
      expect(result.providerMessageId).toBe('<xyz789@distelsa.info>');
    });

    it('should set providerId to "mailgun"', () => {
      const result = service.normalize(buildPayload());
      expect(result.providerId).toBe('mailgun');
    });

    it('should set providerName to "Mailgun"', () => {
      const result = service.normalize(buildPayload());
      expect(result.providerName).toBe('Mailgun');
    });

    it('should extract recipientAddress from event-data.recipient', () => {
      const result = service.normalize(
        buildPayload({ recipient: 'test@example.com' }),
      );
      expect(result.recipientAddress).toBe('test@example.com');
    });
  });

  describe('timestamp conversion', () => {
    it('should convert Unix timestamp 1706745600 to ISO-8601', () => {
      const result = service.normalize(
        buildPayload({ timestamp: 1706745600 }),
      );
      expect(result.timestamp).toBe(
        new Date(1706745600 * 1000).toISOString(),
      );
    });

    it('should produce valid ISO-8601 string', () => {
      const result = service.normalize(buildPayload());
      expect(result.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
      );
    });
  });

  describe('rawStatus', () => {
    it('should set rawStatus to "failed.permanent" for permanent failures', () => {
      const result = service.normalize(
        buildPayload({ event: 'failed', severity: 'permanent' }),
      );
      expect(result.rawStatus).toBe('failed.permanent');
    });

    it('should set rawStatus to "failed.temporary" for temporary failures', () => {
      const result = service.normalize(
        buildPayload({ event: 'failed', severity: 'temporary' }),
      );
      expect(result.rawStatus).toBe('failed.temporary');
    });

    it('should set rawStatus to event name for non-failed events', () => {
      const result = service.normalize(
        buildPayload({ event: 'delivered' }),
      );
      expect(result.rawStatus).toBe('delivered');
    });
  });

  describe('metadata', () => {
    it('should include delivery-status in metadata when present', () => {
      const deliveryStatus = {
        code: 250,
        message: 'OK',
        description: 'Message accepted',
      };
      const result = service.normalize(buildPayload({ deliveryStatus }));
      expect(result.metadata.deliveryStatus).toEqual(deliveryStatus);
    });

    it('should include severity in metadata when present', () => {
      const result = service.normalize(
        buildPayload({ event: 'failed', severity: 'permanent' }),
      );
      expect(result.metadata.severity).toBe('permanent');
    });

    it('should include reason in metadata when present', () => {
      const result = service.normalize(
        buildPayload({
          event: 'failed',
          severity: 'permanent',
          reason: 'bounce',
        }),
      );
      expect(result.metadata.reason).toBe('bounce');
    });

    it('should include ip in metadata for opened events', () => {
      const result = service.normalize(
        buildPayload({ event: 'opened', ip: '192.168.1.1' }),
      );
      expect(result.metadata.ip).toBe('192.168.1.1');
    });

    it('should include url in metadata for clicked events', () => {
      const result = service.normalize(
        buildPayload({
          event: 'clicked',
          url: 'https://example.com/link',
        }),
      );
      expect(result.metadata.url).toBe('https://example.com/link');
    });

    it('should include geolocation in metadata when present', () => {
      const geo = { city: 'Guatemala City', country: 'GT' };
      const result = service.normalize(
        buildPayload({ event: 'opened', geolocation: geo }),
      );
      expect(result.metadata.geolocation).toEqual(geo);
    });

    it('should not include absent optional fields in metadata', () => {
      const result = service.normalize(buildPayload());
      expect(result.metadata).not.toHaveProperty('deliveryStatus');
      expect(result.metadata).not.toHaveProperty('severity');
      expect(result.metadata).not.toHaveProperty('reason');
      expect(result.metadata).not.toHaveProperty('ip');
      expect(result.metadata).not.toHaveProperty('url');
      expect(result.metadata).not.toHaveProperty('geolocation');
    });
  });

  describe('missing custom variables', () => {
    it('should return null for missing notificationId', () => {
      const result = service.normalize(
        buildPayload({ userVariables: {} }),
      );
      expect(result.notificationId).toBeNull();
      expect(result.correlationId).toBeNull();
      expect(result.cycleId).toBeNull();
    });

    it('should not crash when user-variables is missing', () => {
      const payload = buildPayload();
      (payload['event-data'] as any)['user-variables'] = undefined;
      const result = service.normalize(payload);
      expect(result.notificationId).toBeNull();
      expect(result.correlationId).toBeNull();
      expect(result.cycleId).toBeNull();
    });
  });

  describe('unknown event type', () => {
    it('should pass through unknown event type as string', () => {
      const result = service.normalize(
        buildPayload({ event: 'stored' }),
      );
      expect(result.eventType).toBe('stored');
      expect(result.rawStatus).toBe('stored');
    });
  });
});
