import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';
import { RabbitMQPublisherService } from '@app/common';
import { WebhookVerificationService } from '../src/webhooks/webhook-verification.service.js';

function buildSnsNotification(overrides: {
  eventType?: string;
  bounceType?: string;
  bounceSubType?: string;
  recipients?: string[];
  headers?: Array<{ name: string; value: string }>;
  messageId?: string;
} = {}) {
  const eventType = overrides.eventType ?? 'Delivery';
  const notification: Record<string, any> = {
    eventType,
    mail: {
      messageId: overrides.messageId ?? 'ses-e2e-msg-001',
      timestamp: '2024-01-31T12:00:00.000Z',
      source: 'notifications@example.com',
      destination: overrides.recipients ?? ['user@example.com'],
      headers: overrides.headers ?? [
        { name: 'X-Notification-Id', value: 'notif-e2e-001' },
        { name: 'X-Correlation-Id', value: 'corr-e2e-002' },
        { name: 'X-Cycle-Id', value: 'cycle-e2e-003' },
      ],
    },
  };

  if (eventType === 'Delivery') {
    notification.delivery = {
      timestamp: '2024-01-31T12:00:01.000Z',
      processingTimeMillis: 500,
      recipients: overrides.recipients ?? ['user@example.com'],
      smtpResponse: '250 OK',
      reportingMTA: 'a1-2.smtp-out.us-east-1.amazonses.com',
    };
  } else if (eventType === 'Bounce') {
    notification.bounce = {
      bounceType: overrides.bounceType ?? 'Permanent',
      bounceSubType: overrides.bounceSubType ?? 'General',
      bouncedRecipients: (overrides.recipients ?? ['bounce@example.com']).map(
        (email) => ({ emailAddress: email }),
      ),
      timestamp: '2024-01-31T12:00:01.000Z',
      feedbackId: 'fb-e2e-001',
      reportingMTA: 'dsn; mta.example.com',
    };
  } else if (eventType === 'Complaint') {
    notification.complaint = {
      complainedRecipients: (overrides.recipients ?? ['spam@example.com']).map(
        (email) => ({ emailAddress: email }),
      ),
      timestamp: '2024-01-31T12:00:01.000Z',
      feedbackId: 'fb-e2e-002',
      complaintFeedbackType: 'abuse',
    };
  } else if (eventType === 'Send') {
    // Send has no extra fields
  }

  return notification;
}

function buildSnsMessage(overrides: {
  type?: string;
  message?: string;
  subscribeURL?: string;
  eventType?: string;
  bounceType?: string;
  bounceSubType?: string;
  recipients?: string[];
  headers?: Array<{ name: string; value: string }>;
  messageId?: string;
} = {}) {
  const snsMsg: Record<string, any> = {
    Type: overrides.type ?? 'Notification',
    MessageId: 'sns-e2e-msg-001',
    TopicArn: 'arn:aws:sns:us-east-1:123456789:ses-notifications',
    Message:
      overrides.message ??
      JSON.stringify(
        buildSnsNotification({
          eventType: overrides.eventType,
          bounceType: overrides.bounceType,
          bounceSubType: overrides.bounceSubType,
          recipients: overrides.recipients,
          headers: overrides.headers,
          messageId: overrides.messageId,
        }),
      ),
    Timestamp: '2024-01-31T12:00:00.000Z',
    SignatureVersion: '1',
    Signature: 'test-signature',
    SigningCertURL:
      'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem',
  };

  if (overrides.type === 'SubscriptionConfirmation') {
    snsMsg.SubscribeURL =
      overrides.subscribeURL ??
      'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=abc123';
    snsMsg.Token = 'abc123';
  }

  return snsMsg;
}

describe('AWS SES Adapter — POST /webhooks/inbound (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let mockPublishWebhookEvent: jest.Mock;
  let mockVerify: jest.Mock;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;

    // Mock verification to always pass (we test signature separately in unit tests)
    const verificationService = module.get(WebhookVerificationService);
    mockVerify = jest.fn().mockResolvedValue(true);
    verificationService.verify = mockVerify;

    // Mock the RabbitMQ publisher to avoid real connections
    const publisher = module.get(RabbitMQPublisherService);
    mockPublishWebhookEvent = jest.fn();
    publisher.publishWebhookEvent = mockPublishWebhookEvent;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockPublishWebhookEvent.mockClear();
    mockVerify.mockClear();
    mockVerify.mockResolvedValue(true);
  });

  describe('SubscriptionConfirmation', () => {
    it('should return 200 and NOT publish to RabbitMQ', async () => {
      const payload = buildSnsMessage({
        type: 'SubscriptionConfirmation',
        message: 'You have chosen to subscribe...',
      });

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      expect(mockPublishWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('Notification — Delivery event', () => {
    it('should return 200 and publish WebhookEventDto with eventType=delivered', async () => {
      const payload = buildSnsMessage({ eventType: 'Delivery' });

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      expect(mockPublishWebhookEvent).toHaveBeenCalledTimes(1);

      const publishedEvent = mockPublishWebhookEvent.mock.calls[0][0];
      expect(publishedEvent.providerId).toBe('aws-ses');
      expect(publishedEvent.providerName).toBe('Amazon SES');
      expect(publishedEvent.eventType).toBe('delivered');
      expect(publishedEvent.providerMessageId).toBe('ses-e2e-msg-001');
      expect(publishedEvent.notificationId).toBe('notif-e2e-001');
      expect(publishedEvent.correlationId).toBe('corr-e2e-002');
      expect(publishedEvent.cycleId).toBe('cycle-e2e-003');
      expect(publishedEvent.recipientAddress).toBe('user@example.com');
    });
  });

  describe('Notification — Bounce event', () => {
    it('should return 200 and normalize permanent bounce to eventType=bounced', async () => {
      const payload = buildSnsMessage({
        eventType: 'Bounce',
        bounceType: 'Permanent',
        bounceSubType: 'General',
        recipients: ['bounce@example.com'],
      });

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      expect(mockPublishWebhookEvent).toHaveBeenCalledTimes(1);

      const publishedEvent = mockPublishWebhookEvent.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('bounced');
      expect(publishedEvent.rawStatus).toBe('Bounce.Permanent');
      expect(publishedEvent.recipientAddress).toBe('bounce@example.com');
    });

    it('should normalize transient bounce to eventType=temp_fail', async () => {
      const payload = buildSnsMessage({
        eventType: 'Bounce',
        bounceType: 'Transient',
        bounceSubType: 'MailboxFull',
        recipients: ['full@example.com'],
      });

      await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      const publishedEvent = mockPublishWebhookEvent.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('temp_fail');
      expect(publishedEvent.rawStatus).toBe('Bounce.Transient');
    });
  });

  describe('Invalid signature', () => {
    it('should return 401 when signature verification fails', async () => {
      mockVerify.mockResolvedValue(false);

      const payload = buildSnsMessage({ eventType: 'Delivery' });

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(401);

      expect(res.body.code).toBe('SES-009');
      expect(res.body.status).toBe(401);
      expect(mockPublishWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('Full pipeline — receive → normalize → publish', () => {
    it('should process Send event end-to-end', async () => {
      const payload = buildSnsMessage({ eventType: 'Send' });

      await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      expect(mockVerify).toHaveBeenCalledTimes(1);
      expect(mockPublishWebhookEvent).toHaveBeenCalledTimes(1);

      const event = mockPublishWebhookEvent.mock.calls[0][0];
      expect(event.eventType).toBe('sent');
      expect(event.providerId).toBe('aws-ses');
    });

    it('should process Complaint event end-to-end with metadata', async () => {
      const payload = buildSnsMessage({
        eventType: 'Complaint',
        recipients: ['complaint@example.com'],
      });

      await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      const event = mockPublishWebhookEvent.mock.calls[0][0];
      expect(event.eventType).toBe('complained');
      expect(event.recipientAddress).toBe('complaint@example.com');
      expect(event.metadata.complaintFeedbackType).toBe('abuse');
    });
  });

  describe('Metrics', () => {
    it('should show webhook counters in GET /metrics after processing events', async () => {
      const payload = buildSnsMessage({ eventType: 'Delivery' });
      await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200);

      expect(res.text).toContain('adapter_webhook_received_total');
    });
  });
});
