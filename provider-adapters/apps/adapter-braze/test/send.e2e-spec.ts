import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';
import { BrazeClientService } from '../src/braze-client/braze-client.service.js';
import { ProfileSyncService } from '../src/profile-sync/profile-sync.service.js';

describe('Braze Adapter — POST /send (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let mockSendMessage: jest.Mock;
  let mockEnsureProfile: jest.Mock;

  beforeAll(async () => {
    // Set required env vars for test
    process.env.BRAZE_SMS_SUBSCRIPTION_GROUP = 'sub-group-sms-test';
    process.env.BRAZE_WHATSAPP_SUBSCRIPTION_GROUP = 'sub-group-wa-test';
    process.env.BRAZE_APP_ID = process.env.BRAZE_APP_ID || 'test-app-id';
    process.env.BRAZE_FROM_EMAIL = process.env.BRAZE_FROM_EMAIL || 'test@example.com';
    process.env.BRAZE_API_KEY = process.env.BRAZE_API_KEY || 'test-api-key';
    process.env.BRAZE_REST_ENDPOINT = process.env.BRAZE_REST_ENDPOINT || 'https://rest.test.braze.com';
    process.env.BRAZE_WEBHOOK_KEY = process.env.BRAZE_WEBHOOK_KEY || 'test-webhook-key';
    process.env.EMAIL_HASH_PEPPER = process.env.EMAIL_HASH_PEPPER || 'test-pepper';
    const result = await createTestApp();
    app = result.app;
    module = result.module;

    // Mock BrazeClientService.sendMessage to avoid real API calls
    const brazeClient = module.get(BrazeClientService);
    mockSendMessage = jest.fn().mockResolvedValue({
      dispatch_id: 'dispatch-test-123',
      errors: [],
      message: 'success',
    });
    brazeClient.sendMessage = mockSendMessage;

    // Mock ProfileSyncService.ensureProfile to avoid real profile sync
    const profileSync = module.get(ProfileSyncService);
    mockEnsureProfile = jest.fn().mockResolvedValue('a'.repeat(64));
    profileSync.ensureProfile = mockEnsureProfile;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockSendMessage.mockClear();
    mockSendMessage.mockResolvedValue({
      dispatch_id: 'dispatch-test-123',
      errors: [],
      message: 'success',
    });
    mockEnsureProfile.mockClear();
    mockEnsureProfile.mockResolvedValue('a'.repeat(64));
  });

  describe('Email send', () => {
    it('should return 200 with success=true and providerMessageId', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'email',
          recipient: {
            address: 'user@example.com',
            customerId: 'a'.repeat(64),
          },
          content: {
            subject: 'Test Subject',
            body: '<p>Hello World</p>',
          },
          metadata: {
            notificationId: 'notif-123',
            correlationId: 'corr-456',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.providerMessageId).toBe('dispatch-test-123');
      expect(res.body.httpStatus).toBe(200);
      expect(res.body.retryable).toBe(false);
      expect(res.body.errorMessage).toBeNull();
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('SMS send', () => {
    it('should return 200 with success=true for SMS channel', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'sms',
          recipient: {
            address: '+15551234567',
            customerId: 'b'.repeat(64),
          },
          content: {
            body: 'Your order has shipped!',
          },
          metadata: {
            notificationId: 'notif-sms-123',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.providerMessageId).toBe('dispatch-test-123');
    });
  });

  describe('Validation errors', () => {
    it('should return 400 when recipient is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'email',
          content: {
            subject: 'Test',
            body: 'Hello',
          },
          metadata: {
            notificationId: 'notif-123',
          },
        })
        .expect(400);

      expect(res.body.code).toBe('PA-001');
      expect(res.body.status).toBe(400);
    });

    it('should return 400 when body is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'email',
          recipient: { address: 'user@example.com' },
          content: {
            subject: 'Test',
          },
          metadata: {
            notificationId: 'notif-123',
          },
        })
        .expect(400);

      expect(res.body.code).toBe('PA-001');
    });

    it('should return 400 when channel is invalid', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'carrier-pigeon',
          recipient: { address: 'user@example.com' },
          content: { body: 'Hello' },
          metadata: { notificationId: 'notif-123' },
        })
        .expect(400);

      expect(res.body.code).toBe('PA-001');
    });
  });

  describe('WhatsApp template send', () => {
    it('should return 200 with success=true for WhatsApp template', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: {
            address: '+15551234567',
            customerId: 'c'.repeat(64),
          },
          content: { body: 'template body' },
          metadata: {
            notificationId: 'notif-wa-e2e-1',
            templateName: 'order_shipped',
            templateLanguage: 'en',
            templateParameters: [
              { name: 'customer_name', value: 'John' },
              { name: 'order_number', value: '1234' },
            ],
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.providerMessageId).toBe('dispatch-test-123');
    });

    it('should build correct WhatsApp payload to Braze API', async () => {
      await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: {
            address: '+15551234567',
            customerId: 'c'.repeat(64),
          },
          content: { body: 'template body' },
          metadata: {
            notificationId: 'notif-wa-e2e-2',
            templateName: 'order_shipped',
            templateLanguage: 'en',
            templateParameters: [
              { name: 'customer_name', value: 'John' },
            ],
          },
        })
        .expect(200);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: {
            whatsapp: expect.objectContaining({
              message_type: 'template_message',
              subscription_group_id: 'sub-group-wa-test',
              message: expect.objectContaining({
                template_name: 'order_shipped',
                template_language_code: 'en',
                variables: [{ key: 'customer_name', value: 'John' }],
              }),
            }),
          },
        }),
      );
    });

    it('should include IMAGE header when media is present', async () => {
      await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: {
            address: '+15551234567',
            customerId: 'c'.repeat(64),
          },
          content: {
            body: 'template body',
            media: [
              {
                url: 'https://example.com/promo.jpg',
                contentType: 'image/jpeg',
              },
            ],
          },
          metadata: {
            notificationId: 'notif-wa-e2e-3',
            templateName: 'promo_image',
            templateLanguage: 'en',
          },
        })
        .expect(200);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: {
            whatsapp: expect.objectContaining({
              message: expect.objectContaining({
                header: { type: 'IMAGE', url: 'https://example.com/promo.jpg' },
              }),
            }),
          },
        }),
      );
    });
  });

  describe('WhatsApp missing subscription group', () => {
    it('should return 200 with success=false when subscription group is not configured', async () => {
      // Temporarily clear the subscription group
      const original = process.env.BRAZE_WHATSAPP_SUBSCRIPTION_GROUP;
      process.env.BRAZE_WHATSAPP_SUBSCRIPTION_GROUP = '';

      // Need to recreate the app to pick up the new config
      await app.close();
      const result = await createTestApp();
      app = result.app;
      module = result.module;

      // Re-mock after app recreation
      const brazeClient = module.get(BrazeClientService);
      mockSendMessage = jest.fn().mockResolvedValue({
        dispatch_id: 'dispatch-test-123',
        errors: [],
        message: 'success',
      });
      brazeClient.sendMessage = mockSendMessage;

      const profileSync = module.get(ProfileSyncService);
      mockEnsureProfile = jest.fn().mockResolvedValue('a'.repeat(64));
      profileSync.ensureProfile = mockEnsureProfile;

      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: { address: '+15551234567' },
          content: { body: 'test' },
          metadata: {
            notificationId: 'notif-wa-miss',
            templateName: 'test_tmpl',
            templateLanguage: 'en',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(mockSendMessage).not.toHaveBeenCalled();

      // Restore
      process.env.BRAZE_WHATSAPP_SUBSCRIPTION_GROUP = original;
      await app.close();
      const restored = await createTestApp();
      app = restored.app;
      module = restored.module;

      const bc2 = module.get(BrazeClientService);
      mockSendMessage = jest.fn().mockResolvedValue({
        dispatch_id: 'dispatch-test-123',
        errors: [],
        message: 'success',
      });
      bc2.sendMessage = mockSendMessage;

      const ps2 = module.get(ProfileSyncService);
      mockEnsureProfile = jest.fn().mockResolvedValue('a'.repeat(64));
      ps2.ensureProfile = mockEnsureProfile;
    });
  });

  describe('Push send', () => {
    it('should return 200 with success=true for push channel', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'push',
          recipient: {
            address: 'device-token-123',
            customerId: 'd'.repeat(64),
          },
          content: {
            subject: 'Push Title',
            body: 'Push notification body',
          },
          metadata: { notificationId: 'notif-push-1' },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.providerMessageId).toBe('dispatch-test-123');
    });

    it('should build both apple_push and android_push in payload', async () => {
      await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'push',
          recipient: {
            address: 'device-token-123',
            customerId: 'd'.repeat(64),
          },
          content: {
            subject: 'Push Title',
            body: 'Push body',
          },
          metadata: { notificationId: 'notif-push-2' },
        })
        .expect(200);

      expect(mockSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.objectContaining({
            apple_push: expect.objectContaining({
              alert: { title: 'Push Title', body: 'Push body' },
            }),
            android_push: expect.objectContaining({
              title: 'Push Title',
              alert: 'Push body',
            }),
          }),
        }),
      );
    });

    it('should include media in push payload', async () => {
      await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'push',
          recipient: {
            address: 'device-token-123',
            customerId: 'd'.repeat(64),
          },
          content: {
            subject: 'Rich Push',
            body: 'With image',
            media: [
              {
                url: 'https://example.com/hero.jpg',
                contentType: 'image/jpeg',
              },
            ],
          },
          metadata: { notificationId: 'notif-push-3' },
        })
        .expect(200);

      const payload = mockSendMessage.mock.calls[0][0];
      expect(payload.messages.apple_push.mutable_content).toBe(true);
      expect(payload.messages.apple_push.media_url).toBe(
        'https://example.com/hero.jpg',
      );
      expect(payload.messages.android_push.image_url).toBe(
        'https://example.com/hero.jpg',
      );
    });
  });

  describe('SendResultDto shape', () => {
    it('should return all expected fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'email',
          recipient: { address: 'user@example.com' },
          content: {
            subject: 'Shape Test',
            body: '<p>Testing shape</p>',
          },
          metadata: { notificationId: 'notif-shape' },
        })
        .expect(200);

      expect(res.body).toHaveProperty('success');
      expect(res.body).toHaveProperty('providerMessageId');
      expect(res.body).toHaveProperty('retryable');
      expect(res.body).toHaveProperty('errorMessage');
      expect(res.body).toHaveProperty('httpStatus');
      expect(res.body).toHaveProperty('providerResponse');
    });
  });

  describe('Braze API error handling', () => {
    it('should return 200 with success=false on Braze 429', async () => {
      const error = new Error('Too Many Requests') as any;
      error.isAxiosError = true;
      error.response = {
        status: 429,
        data: { message: 'Too Many Requests' },
        headers: {},
        statusText: 'Too Many Requests',
        config: {},
      };
      error.config = {};
      mockSendMessage.mockRejectedValue(error);

      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'email',
          recipient: { address: 'user@example.com' },
          content: { subject: 'Test', body: '<p>Hello</p>' },
          metadata: { notificationId: 'notif-123' },
        })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(res.body.retryable).toBe(true);
    });

    it('should return 200 with success=false on Braze 401', async () => {
      const error = new Error('Unauthorized') as any;
      error.isAxiosError = true;
      error.response = {
        status: 401,
        data: { message: 'Forbidden' },
        headers: {},
        statusText: 'Unauthorized',
        config: {},
      };
      error.config = {};
      mockSendMessage.mockRejectedValue(error);

      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'email',
          recipient: { address: 'user@example.com' },
          content: { subject: 'Test', body: '<p>Hello</p>' },
          metadata: { notificationId: 'notif-123' },
        })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(res.body.retryable).toBe(false);
    });
  });
});
