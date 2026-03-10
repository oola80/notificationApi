import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';
import { RabbitMQPublisherService } from '@app/common';

const WEBHOOK_KEY = 'test-braze-webhook-key-12345';

function buildPostbackPayload(
  overrides: Record<string, any> = {},
): Record<string, any> {
  return {
    event_type: 'users.messages.email.Delivery',
    dispatch_id: 'dispatch-e2e-123',
    external_user_id: 'ext-user-abc',
    email_address: 'user@example.com',
    timestamp: '2026-03-09T12:00:00Z',
    key_value_pairs: {
      notificationId: 'notif-e2e-001',
      correlationId: 'corr-e2e-002',
      cycleId: 'cycle-e2e-003',
    },
    ...overrides,
  };
}

function buildCurrentsBatchPayload(
  events: Record<string, any>[] = [],
): Record<string, any> {
  return {
    events:
      events.length > 0
        ? events
        : [
            {
              event_type: 'users.messages.email.Delivery',
              dispatch_id: 'dispatch-c1',
              email_address: 'batch1@example.com',
              timestamp: 1741521600,
              properties: { notificationId: 'notif-c1' },
            },
            {
              event_type: 'users.messages.sms.Delivery',
              dispatch_id: 'dispatch-c2',
              phone_number: '+50212345678',
              timestamp: 1741521601,
              properties: { notificationId: 'notif-c2' },
            },
            {
              event_type: 'users.messages.whatsapp.Read',
              dispatch_id: 'dispatch-c3',
              phone_number: '+50287654321',
              timestamp: 1741521602,
              properties: {},
            },
          ],
  };
}

describe('Braze Adapter — POST /webhooks/inbound (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let mockPublishWebhookEvent: jest.Mock;

  beforeAll(async () => {
    process.env.BRAZE_WEBHOOK_KEY = WEBHOOK_KEY;
    process.env.BRAZE_API_KEY = 'test-api-key';
    process.env.BRAZE_REST_ENDPOINT = 'https://rest.test.braze.com';
    process.env.BRAZE_APP_ID = 'test-app-id';
    process.env.BRAZE_FROM_EMAIL = 'test@example.com';
    process.env.EMAIL_HASH_PEPPER = 'test-pepper';

    const result = await createTestApp();
    app = result.app;
    module = result.module;

    const publisher = module.get(RabbitMQPublisherService);
    mockPublishWebhookEvent = jest.fn();
    publisher.publishWebhookEvent = mockPublishWebhookEvent;
  });

  afterAll(async () => {
    await app.close();
    delete process.env.BRAZE_WEBHOOK_KEY;
    delete process.env.BRAZE_API_KEY;
    delete process.env.BRAZE_REST_ENDPOINT;
    delete process.env.BRAZE_APP_ID;
    delete process.env.BRAZE_FROM_EMAIL;
    delete process.env.EMAIL_HASH_PEPPER;
  });

  beforeEach(() => {
    mockPublishWebhookEvent.mockClear();
  });

  describe('Valid postback with correct key', () => {
    it('should return 200 and publish WebhookEventDto with eventType=delivered', async () => {
      const payload = buildPostbackPayload();

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .set('X-Braze-Webhook-Key', WEBHOOK_KEY)
        .send(payload)
        .expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      expect(mockPublishWebhookEvent).toHaveBeenCalledTimes(1);

      const publishedEvent = mockPublishWebhookEvent.mock.calls[0][0];
      expect(publishedEvent.providerId).toBe('braze');
      expect(publishedEvent.providerName).toBe('Braze');
      expect(publishedEvent.eventType).toBe('delivered');
      expect(publishedEvent.providerMessageId).toBe('dispatch-e2e-123');
      expect(publishedEvent.notificationId).toBe('notif-e2e-001');
      expect(publishedEvent.correlationId).toBe('corr-e2e-002');
      expect(publishedEvent.cycleId).toBe('cycle-e2e-003');
      expect(publishedEvent.recipientAddress).toBe('user@example.com');
    });
  });

  describe('Invalid key', () => {
    it('should still return 200 (to stop Braze retries) but not publish', async () => {
      const payload = buildPostbackPayload();

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .set('X-Braze-Webhook-Key', 'wrong-key-value-12345678')
        .send(payload)
        .expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      expect(mockPublishWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('Missing key header', () => {
    it('should still return 200 but not publish', async () => {
      const payload = buildPostbackPayload();

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .send(payload)
        .expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      expect(mockPublishWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('Currents batch processing', () => {
    it('should process all events in a Currents batch', async () => {
      const payload = buildCurrentsBatchPayload();

      const res = await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .set('X-Braze-Webhook-Key', WEBHOOK_KEY)
        .send(payload)
        .expect(200);

      expect(res.body).toEqual({ status: 'ok' });
      expect(mockPublishWebhookEvent).toHaveBeenCalledTimes(3);

      // First event: email delivery
      const event1 = mockPublishWebhookEvent.mock.calls[0][0];
      expect(event1.eventType).toBe('delivered');
      expect(event1.recipientAddress).toBe('batch1@example.com');

      // Second event: SMS delivery
      const event2 = mockPublishWebhookEvent.mock.calls[1][0];
      expect(event2.eventType).toBe('delivered');
      expect(event2.recipientAddress).toBe('+50212345678');

      // Third event: WhatsApp read
      const event3 = mockPublishWebhookEvent.mock.calls[2][0];
      expect(event3.eventType).toBe('read');
      expect(event3.recipientAddress).toBe('+50287654321');
    });
  });

  describe('Event normalization verification', () => {
    it('should normalize email.Bounce to bounced', async () => {
      const payload = buildPostbackPayload({
        event_type: 'users.messages.email.Bounce',
      });

      await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .set('X-Braze-Webhook-Key', WEBHOOK_KEY)
        .send(payload)
        .expect(200);

      const publishedEvent = mockPublishWebhookEvent.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('bounced');
      expect(publishedEvent.rawStatus).toBe('users.messages.email.Bounce');
    });

    it('should normalize whatsapp.Send to sent', async () => {
      const payload = buildPostbackPayload({
        event_type: 'users.messages.whatsapp.Send',
        phone_number: '+50212345678',
        email_address: undefined,
      });

      await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .set('X-Braze-Webhook-Key', WEBHOOK_KEY)
        .send(payload)
        .expect(200);

      const publishedEvent = mockPublishWebhookEvent.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('sent');
    });

    it('should normalize pushnotification.Open to opened', async () => {
      const payload = buildPostbackPayload({
        event_type: 'users.messages.pushnotification.Open',
        device_id: 'device-abc',
        email_address: undefined,
      });

      await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .set('X-Braze-Webhook-Key', WEBHOOK_KEY)
        .send(payload)
        .expect(200);

      const publishedEvent = mockPublishWebhookEvent.mock.calls[0][0];
      expect(publishedEvent.eventType).toBe('opened');
    });

    it('should not publish for unknown event types', async () => {
      const payload = buildPostbackPayload({
        event_type: 'users.messages.email.Unknown',
      });

      await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .set('X-Braze-Webhook-Key', WEBHOOK_KEY)
        .send(payload)
        .expect(200);

      expect(mockPublishWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('Metrics', () => {
    it('should show webhook counters in GET /metrics after processing events', async () => {
      const payload = buildPostbackPayload();
      await request(app.getHttpServer())
        .post('/webhooks/inbound')
        .set('X-Braze-Webhook-Key', WEBHOOK_KEY)
        .send(payload)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200);

      expect(res.text).toContain('adapter_webhook_received_total');
    });
  });
});
