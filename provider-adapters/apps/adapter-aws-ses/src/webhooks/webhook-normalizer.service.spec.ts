import { Test, TestingModule } from '@nestjs/testing';
import { WebhookEventType } from '@app/common';
import { WebhookNormalizerService } from './webhook-normalizer.service.js';
import type { SesNotification } from './interfaces/ses-webhook.interfaces.js';

function buildNotification(
  overrides: Partial<SesNotification> & { eventType: string } = {
    eventType: 'Delivery',
  },
): SesNotification {
  return {
    eventType: overrides.eventType as any,
    mail: overrides.mail ?? {
      messageId: 'ses-msg-001',
      timestamp: '2024-01-31T12:00:00.000Z',
      source: 'notifications@example.com',
      destination: ['user@example.com'],
      headers: [
        { name: 'X-Notification-Id', value: 'notif-001' },
        { name: 'X-Correlation-Id', value: 'corr-002' },
        { name: 'X-Cycle-Id', value: 'cycle-003' },
      ],
    },
    delivery: overrides.delivery,
    bounce: overrides.bounce,
    complaint: overrides.complaint,
    reject: overrides.reject,
    open: overrides.open,
    click: overrides.click,
    send: overrides.send,
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
    it('should map "Send" → SENT', () => {
      const result = service.normalize(buildNotification({ eventType: 'Send' }));
      expect(result.eventType).toBe(WebhookEventType.SENT);
    });

    it('should map "Delivery" → DELIVERED', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Delivery',
          delivery: {
            timestamp: '2024-01-31T12:00:01.000Z',
            processingTimeMillis: 500,
            recipients: ['user@example.com'],
            smtpResponse: '250 OK',
            reportingMTA: 'mta.example.com',
          },
        }),
      );
      expect(result.eventType).toBe(WebhookEventType.DELIVERED);
    });

    it('should map "Bounce" (Permanent) → BOUNCED', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Bounce',
          bounce: {
            bounceType: 'Permanent',
            bounceSubType: 'General',
            bouncedRecipients: [{ emailAddress: 'bounce@example.com' }],
            timestamp: '2024-01-31T12:00:01.000Z',
            feedbackId: 'fb-001',
          },
        }),
      );
      expect(result.eventType).toBe(WebhookEventType.BOUNCED);
    });

    it('should map "Bounce" (Transient) → TEMP_FAIL', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Bounce',
          bounce: {
            bounceType: 'Transient',
            bounceSubType: 'MailboxFull',
            bouncedRecipients: [{ emailAddress: 'full@example.com' }],
            timestamp: '2024-01-31T12:00:01.000Z',
            feedbackId: 'fb-002',
          },
        }),
      );
      expect(result.eventType).toBe(WebhookEventType.TEMP_FAIL);
    });

    it('should map "Bounce" (Undetermined) → TEMP_FAIL', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Bounce',
          bounce: {
            bounceType: 'Undetermined',
            bounceSubType: 'Undetermined',
            bouncedRecipients: [{ emailAddress: 'unknown@example.com' }],
            timestamp: '2024-01-31T12:00:01.000Z',
            feedbackId: 'fb-003',
          },
        }),
      );
      expect(result.eventType).toBe(WebhookEventType.TEMP_FAIL);
    });

    it('should map "Complaint" → COMPLAINED', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Complaint',
          complaint: {
            complainedRecipients: [{ emailAddress: 'spam@example.com' }],
            timestamp: '2024-01-31T12:00:01.000Z',
            feedbackId: 'fb-004',
            complaintFeedbackType: 'abuse',
          },
        }),
      );
      expect(result.eventType).toBe(WebhookEventType.COMPLAINED);
    });

    it('should map "Reject" → FAILED', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Reject',
          reject: { reason: 'Bad content' },
        }),
      );
      expect(result.eventType).toBe(WebhookEventType.FAILED);
    });

    it('should map "Open" → OPENED', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Open',
          open: {
            timestamp: '2024-01-31T12:05:00.000Z',
            userAgent: 'Mozilla/5.0',
            ipAddress: '192.168.1.1',
          },
        }),
      );
      expect(result.eventType).toBe(WebhookEventType.OPENED);
    });

    it('should map "Click" → CLICKED', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Click',
          click: {
            timestamp: '2024-01-31T12:05:00.000Z',
            ipAddress: '192.168.1.1',
            userAgent: 'Mozilla/5.0',
            link: 'https://example.com/link',
          },
        }),
      );
      expect(result.eventType).toBe(WebhookEventType.CLICKED);
    });
  });

  describe('bounce subtype handling', () => {
    it('should set rawStatus to "Bounce.Permanent" for permanent bounces', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Bounce',
          bounce: {
            bounceType: 'Permanent',
            bounceSubType: 'General',
            bouncedRecipients: [{ emailAddress: 'bounce@example.com' }],
            timestamp: '2024-01-31T12:00:01.000Z',
            feedbackId: 'fb-005',
          },
        }),
      );
      expect(result.rawStatus).toBe('Bounce.Permanent');
    });

    it('should set rawStatus to "Bounce.Transient" for transient bounces', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Bounce',
          bounce: {
            bounceType: 'Transient',
            bounceSubType: 'MailboxFull',
            bouncedRecipients: [{ emailAddress: 'full@example.com' }],
            timestamp: '2024-01-31T12:00:01.000Z',
            feedbackId: 'fb-006',
          },
        }),
      );
      expect(result.rawStatus).toBe('Bounce.Transient');
    });

    it('should include bounceType and bounceSubType in metadata', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Bounce',
          bounce: {
            bounceType: 'Permanent',
            bounceSubType: 'Suppressed',
            bouncedRecipients: [
              {
                emailAddress: 'bounce@example.com',
                diagnosticCode: 'smtp; 550 5.1.1 user unknown',
              },
            ],
            timestamp: '2024-01-31T12:00:01.000Z',
            feedbackId: 'fb-007',
            reportingMTA: 'dsn; mta.example.com',
          },
        }),
      );
      expect(result.metadata.bounceType).toBe('Permanent');
      expect(result.metadata.bounceSubType).toBe('Suppressed');
      expect(result.metadata.diagnosticCode).toBe(
        'smtp; 550 5.1.1 user unknown',
      );
      expect(result.metadata.reportingMTA).toBe('dsn; mta.example.com');
    });
  });

  describe('header extraction for correlation IDs', () => {
    it('should extract notificationId from X-Notification-Id header', () => {
      const result = service.normalize(buildNotification({ eventType: 'Delivery' }));
      expect(result.notificationId).toBe('notif-001');
    });

    it('should extract correlationId from X-Correlation-Id header', () => {
      const result = service.normalize(buildNotification({ eventType: 'Delivery' }));
      expect(result.correlationId).toBe('corr-002');
    });

    it('should extract cycleId from X-Cycle-Id header', () => {
      const result = service.normalize(buildNotification({ eventType: 'Delivery' }));
      expect(result.cycleId).toBe('cycle-003');
    });

    it('should return null when custom headers are not present', () => {
      const notification = buildNotification({ eventType: 'Delivery' });
      notification.mail.headers = [];

      const result = service.normalize(notification);
      expect(result.notificationId).toBeNull();
      expect(result.correlationId).toBeNull();
      expect(result.cycleId).toBeNull();
    });

    it('should return null when headers array is undefined', () => {
      const notification = buildNotification({ eventType: 'Delivery' });
      notification.mail.headers = undefined;

      const result = service.normalize(notification);
      expect(result.notificationId).toBeNull();
      expect(result.correlationId).toBeNull();
      expect(result.cycleId).toBeNull();
    });
  });

  describe('metadata population per event type', () => {
    it('should populate delivery metadata', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Delivery',
          delivery: {
            timestamp: '2024-01-31T12:00:01.000Z',
            processingTimeMillis: 500,
            recipients: ['user@example.com'],
            smtpResponse: '250 OK',
            reportingMTA: 'mta.example.com',
            remoteMtaIp: '10.0.0.1',
          },
        }),
      );
      expect(result.metadata.deliveryStatus).toEqual({
        smtpResponse: '250 OK',
        processingTimeMillis: 500,
        reportingMTA: 'mta.example.com',
        remoteMtaIp: '10.0.0.1',
      });
      expect(result.metadata.recipients).toEqual(['user@example.com']);
    });

    it('should populate complaint metadata', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Complaint',
          complaint: {
            complainedRecipients: [{ emailAddress: 'spam@example.com' }],
            timestamp: '2024-01-31T12:00:01.000Z',
            feedbackId: 'fb-008',
            complaintFeedbackType: 'abuse',
            userAgent: 'Amazon SES Mailbox Simulator',
          },
        }),
      );
      expect(result.metadata.complaintFeedbackType).toBe('abuse');
      expect(result.metadata.userAgent).toBe('Amazon SES Mailbox Simulator');
      expect(result.metadata.recipients).toEqual(['spam@example.com']);
    });

    it('should populate reject metadata', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Reject',
          reject: { reason: 'Bad content' },
        }),
      );
      expect(result.metadata.rejectReason).toBe('Bad content');
    });

    it('should populate open metadata', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Open',
          open: {
            timestamp: '2024-01-31T12:05:00.000Z',
            userAgent: 'Mozilla/5.0',
            ipAddress: '192.168.1.1',
          },
        }),
      );
      expect(result.metadata.userAgent).toBe('Mozilla/5.0');
      expect(result.metadata.ipAddress).toBe('192.168.1.1');
    });

    it('should populate click metadata', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Click',
          click: {
            timestamp: '2024-01-31T12:05:00.000Z',
            ipAddress: '10.0.0.1',
            userAgent: 'Chrome/120.0',
            link: 'https://example.com/promo',
          },
        }),
      );
      expect(result.metadata.clickUrl).toBe('https://example.com/promo');
      expect(result.metadata.userAgent).toBe('Chrome/120.0');
      expect(result.metadata.ipAddress).toBe('10.0.0.1');
    });
  });

  describe('unknown event type', () => {
    it('should pass through unknown event type as string', () => {
      const result = service.normalize(
        buildNotification({ eventType: 'DeliveryDelay' as any }),
      );
      expect(result.eventType).toBe('DeliveryDelay');
      expect(result.rawStatus).toBe('DeliveryDelay');
    });
  });

  describe('field extraction', () => {
    it('should set providerId to "aws-ses"', () => {
      const result = service.normalize(buildNotification({ eventType: 'Delivery' }));
      expect(result.providerId).toBe('aws-ses');
    });

    it('should set providerName to "Amazon SES"', () => {
      const result = service.normalize(buildNotification({ eventType: 'Delivery' }));
      expect(result.providerName).toBe('Amazon SES');
    });

    it('should extract providerMessageId from mail.messageId', () => {
      const result = service.normalize(buildNotification({ eventType: 'Delivery' }));
      expect(result.providerMessageId).toBe('ses-msg-001');
    });

    it('should extract recipient from delivery.recipients', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Delivery',
          delivery: {
            timestamp: '2024-01-31T12:00:01.000Z',
            processingTimeMillis: 500,
            recipients: ['delivered@example.com'],
            smtpResponse: '250 OK',
            reportingMTA: 'mta.example.com',
          },
        }),
      );
      expect(result.recipientAddress).toBe('delivered@example.com');
    });

    it('should extract recipient from bounce.bouncedRecipients', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Bounce',
          bounce: {
            bounceType: 'Permanent',
            bounceSubType: 'General',
            bouncedRecipients: [{ emailAddress: 'bounced@example.com' }],
            timestamp: '2024-01-31T12:00:01.000Z',
            feedbackId: 'fb-009',
          },
        }),
      );
      expect(result.recipientAddress).toBe('bounced@example.com');
    });

    it('should fall back to mail.destination for Send events', () => {
      const result = service.normalize(buildNotification({ eventType: 'Send' }));
      expect(result.recipientAddress).toBe('user@example.com');
    });
  });

  describe('timestamp extraction', () => {
    it('should produce valid ISO-8601 string', () => {
      const result = service.normalize(buildNotification({ eventType: 'Send' }));
      expect(result.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/,
      );
    });

    it('should use delivery timestamp when available', () => {
      const result = service.normalize(
        buildNotification({
          eventType: 'Delivery',
          delivery: {
            timestamp: '2024-06-15T10:30:00.000Z',
            processingTimeMillis: 200,
            recipients: ['user@example.com'],
            smtpResponse: '250 OK',
            reportingMTA: 'mta.example.com',
          },
        }),
      );
      expect(result.timestamp).toBe('2024-06-15T10:30:00.000Z');
    });
  });
});
