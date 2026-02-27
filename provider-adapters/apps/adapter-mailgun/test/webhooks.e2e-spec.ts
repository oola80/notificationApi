import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { createHmac } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';
import { RabbitMQPublisherService } from '@app/common';

const SIGNING_KEY = 'test-signing-key-12345';

function generateSignature(
  timestampOverride?: string,
): { timestamp: string; token: string; signature: string } {
  const timestamp =
    timestampOverride ?? Math.floor(Date.now() / 1000).toString();
  const token = 'e2e-test-token-random';
  const signature = createHmac('sha256', SIGNING_KEY)
    .update(timestamp + token)
    .digest('hex');
  return { timestamp, token, signature };
}

function buildWebhookPayload(
  overrides: {
    event?: string;
    severity?: string;
    signatureOverride?: { timestamp: string; token: string; signature: string };
    messageId?: string;
    userVariables?: Record<string, string>;
  } = {},
) {
  const sig = overrides.signatureOverride ?? generateSignature();

  return {
    signature: sig,
    'event-data': {
      event: overrides.event ?? 'delivered',
      id: 'evt-e2e-123',
      timestamp: Date.now() / 1000,
      severity: overrides.severity,
      message: {
        headers: {
          'message-id': overrides.messageId ?? '<e2e-test@distelsa.info>',
          to: 'user@example.com',
          from: 'notifications@distelsa.info',
          subject: 'E2E Test',
        },
      },
      recipient: 'user@example.com',
      'user-variables': overrides.userVariables ?? {
        notificationId: 'notif-e2e-001',
        correlationId: 'corr-e2e-002',
        cycleId: 'cycle-e2e-003',
      },
    },
  };
}

describe('Mailgun Adapter — POST /webhooks/inbound (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let mockPublishWebhookEvent: jest.Mock;

  beforeAll(async () => {
    // Set signing key env variable before creating app
    process.env.MAILGUN_WEBHOOK_SIGNING_KEY = SIGNING_KEY;

    const result = await createTestApp();
    app = result.app;
    module = result.module;

    // Mock the RabbitMQ publisher to avoid real connections
    const publisher = module.get(RabbitMQPublisherService);
    mockPublishWebhookEvent = jest.fn();
    publisher.publishWebhookEvent = mockPublishWebhookEvent;
  });

  afterAll(async () => {
    await app.close();
    delete process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  });

  beforeEach(() => {
    mockPublishWebhookEvent.mockClear();
  });

  describe('Valid "delivered" event', () => {
    it('should return 200 and publish WebhookEventDto with eventType=delivered', async () => {
      const payload = buildWebhookPayload({ event: 'delivered' });

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      expect(mockPublishWebhookEvent).toHaveBeenCalledTimes(1);

      const publishedEvent = mockPublishWebhookEvent.mock.calls[0][0];
      expect(publishedEvent.providerId).toBe('mailgun');
      expect(publishedEvent.providerName).toBe('Mailgun');
      expect(publishedEvent.eventType).toBe('delivered');
      expect(publishedEvent.providerMessageId).toBe(
        '<e2e-test@distelsa.info>',
      );
      expect(publishedEvent.notificationId).toBe('notif-e2e-001');
      expect(publishedEvent.correlationId).toBe('corr-e2e-002');
      expect(publishedEvent.cycleId).toBe('cycle-e2e-003');
      expect(publishedEvent.recipientAddress).toBe('user@example.com');
    });
  });

  describe('Valid "failed" permanent event', () => {
    it('should return 200 and normalize to eventType=bounced, rawStatus=failed.permanent', async () => {
      const payload = buildWebhookPayload({
        event: 'failed',
        severity: 'permanent',
      });

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      expect(mockPublishWebhookEvent).toHaveBeenCalledTimes(1);

      const publishedEvent = mockPublishWebhookEvent.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('bounced');
      expect(publishedEvent.rawStatus).toBe('failed.permanent');
    });
  });

  describe('Valid "opened" event with custom variables', () => {
    it('should return 200 and extract custom variables', async () => {
      const payload = buildWebhookPayload({
        event: 'opened',
        userVariables: {
          notificationId: 'notif-open-123',
          correlationId: 'corr-open-456',
          cycleId: 'cycle-open-789',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      expect(res.body).toEqual({ status: 'ok' });

      const publishedEvent = mockPublishWebhookEvent.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('opened');
      expect(publishedEvent.notificationId).toBe('notif-open-123');
      expect(publishedEvent.correlationId).toBe('corr-open-456');
      expect(publishedEvent.cycleId).toBe('cycle-open-789');
    });
  });

  describe('Invalid signature', () => {
    it('should return 401 when signature is invalid', async () => {
      const payload = buildWebhookPayload({
        signatureOverride: {
          timestamp: Math.floor(Date.now() / 1000).toString(),
          token: 'some-token',
          signature: 'completely-invalid-signature-value',
        },
      });

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(401);

      expect(res.body.code).toBe('MG-004');
      expect(res.body.status).toBe(401);
      expect(mockPublishWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('Expired timestamp', () => {
    it('should return 401 when timestamp is older than 5 minutes', async () => {
      const expiredTimestamp = (
        Math.floor(Date.now() / 1000) - 400
      ).toString();
      const sig = generateSignature(expiredTimestamp);

      const payload = buildWebhookPayload({
        signatureOverride: sig,
      });

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(401);

      expect(res.body.code).toBe('MG-004');
      expect(mockPublishWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('RabbitMQ routing key', () => {
    it('should call publishWebhookEvent with event containing providerId=mailgun', async () => {
      const payload = buildWebhookPayload();

      await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      expect(mockPublishWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'mailgun' }),
      );
    });
  });

  describe('Metrics endpoint', () => {
    it('should show webhook counters in GET /metrics after processing events', async () => {
      // Process a valid event first
      const payload = buildWebhookPayload();
      await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      // Check metrics
      const res = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200);

      expect(res.text).toContain('adapter_webhook_received_total');
    });
  });
});
