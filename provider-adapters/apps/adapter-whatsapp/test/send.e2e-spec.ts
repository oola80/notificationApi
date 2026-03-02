import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';
import { WhatsAppClientService } from '../src/whatsapp-client/whatsapp-client.service.js';

describe('WhatsApp Adapter — POST /send (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let mockSendMessage: jest.Mock;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;

    // Mock the WhatsAppClientService.sendMessage to avoid real API calls
    const whatsappClient = module.get(WhatsAppClientService);
    mockSendMessage = jest.fn().mockResolvedValue({
      messaging_product: 'whatsapp',
      contacts: [{ input: '50212345678', wa_id: '50212345678' }],
      messages: [{ id: 'wamid.HBgLMTIzNDU2Nzg5MAA=' }],
    });
    whatsappClient.sendMessage = mockSendMessage;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockSendMessage.mockClear();
    mockSendMessage.mockResolvedValue({
      messaging_product: 'whatsapp',
      contacts: [{ input: '50212345678', wa_id: '50212345678' }],
      messages: [{ id: 'wamid.HBgLMTIzNDU2Nzg5MAA=' }],
    });
  });

  describe('Valid template message', () => {
    it('should return 200 with success=true and providerMessageId', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: { address: '+50212345678' },
          content: {
            subject: 'template:hello_world',
            body: 'Hello World',
          },
          metadata: {
            notificationId: 'notif-123',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.providerMessageId).toBe('wamid.HBgLMTIzNDU2Nzg5MAA=');
      expect(res.body.httpStatus).toBe(200);
      expect(res.body.retryable).toBe(false);
      expect(res.body.errorMessage).toBeNull();
      expect(mockSendMessage).toHaveBeenCalledTimes(1);

      // Verify the payload sent to Meta API
      const payload = mockSendMessage.mock.calls[0][0];
      expect(payload.messaging_product).toBe('whatsapp');
      expect(payload.to).toBe('50212345678'); // leading + stripped
      expect(payload.type).toBe('template');
      expect(payload.template.name).toBe('hello_world');
      expect(payload.template.language.code).toBe('en');
    });
  });

  describe('Valid text message', () => {
    it('should return 200 with success=true for text message', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: { address: '+50212345678' },
          content: {
            body: 'Hello, this is a test message!',
          },
          metadata: {
            notificationId: 'notif-456',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.providerMessageId).toBe('wamid.HBgLMTIzNDU2Nzg5MAA=');
      expect(mockSendMessage).toHaveBeenCalledTimes(1);

      // Verify text message payload
      const payload = mockSendMessage.mock.calls[0][0];
      expect(payload.type).toBe('text');
      expect(payload.text.body).toBe('Hello, this is a test message!');
    });
  });

  describe('Template message with language override', () => {
    it('should parse language code from subject', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: { address: '+50212345678' },
          content: {
            subject: 'template:order_update:es_MX',
            body: 'Order #12345,Shipped',
          },
          metadata: {
            notificationId: 'notif-789',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const payload = mockSendMessage.mock.calls[0][0];
      expect(payload.template.name).toBe('order_update');
      expect(payload.template.language.code).toBe('es_MX');
      expect(payload.template.components).toBeDefined();
      expect(payload.template.components[0].parameters).toHaveLength(2);
      expect(payload.template.components[0].parameters[0].text).toBe(
        'Order #12345',
      );
      expect(payload.template.components[0].parameters[1].text).toBe(
        'Shipped',
      );
    });
  });

  describe('Non-whatsapp channel', () => {
    it('should return 200 with success=false for email channel', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'email',
          recipient: { address: 'user@example.com' },
          content: {
            subject: 'Test',
            body: 'Hello via Email',
          },
          metadata: {
            notificationId: 'notif-123',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(res.body.errorMessage).toContain('email');
      expect(res.body.retryable).toBe(false);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Invalid body — missing recipient', () => {
    it('should return 400 validation error', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          content: {
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
  });

  describe('Meta API returns 429', () => {
    it('should return 200 with success=false, retryable=true', async () => {
      const error = new Error('Too Many Requests') as any;
      error.isAxiosError = true;
      error.response = {
        status: 429,
        data: {
          error: {
            message: 'Too many calls',
            type: 'OAuthException',
            code: 130429,
            fbtrace_id: 'abc123',
          },
        },
        headers: {},
        statusText: 'Too Many Requests',
        config: {},
      };
      error.config = {};
      mockSendMessage.mockRejectedValue(error);

      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: { address: '+50212345678' },
          content: {
            subject: 'template:hello_world',
            body: 'Hello World',
          },
          metadata: {
            notificationId: 'notif-123',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(res.body.retryable).toBe(true);
      expect(res.body.providerMessageId).toBeNull();
    });
  });

  describe('Meta API returns 401', () => {
    it('should return 200 with success=false, retryable=false', async () => {
      const error = new Error('Unauthorized') as any;
      error.isAxiosError = true;
      error.response = {
        status: 401,
        data: {
          error: {
            message: 'Invalid OAuth access token',
            type: 'OAuthException',
            code: 190,
            fbtrace_id: 'abc123',
          },
        },
        headers: {},
        statusText: 'Unauthorized',
        config: {},
      };
      error.config = {};
      mockSendMessage.mockRejectedValue(error);

      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: { address: '+50212345678' },
          content: {
            subject: 'template:hello_world',
            body: 'Hello World',
          },
          metadata: {
            notificationId: 'notif-123',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(res.body.retryable).toBe(false);
    });
  });

  describe('Template message via metadata.templateName (pipeline flow)', () => {
    it('should send template message when metadata.templateName is provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: { address: '+50212345678' },
          content: {
            body: 'Order #12345,Shipped',
          },
          metadata: {
            notificationId: 'notif-pipe-001',
            templateName: 'order_update',
            templateLanguage: 'es_MX',
            templateParameters: ['Order #12345', 'Shipped'],
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.providerMessageId).toBe('wamid.HBgLMTIzNDU2Nzg5MAA=');
      expect(mockSendMessage).toHaveBeenCalledTimes(1);

      const payload = mockSendMessage.mock.calls[0][0];
      expect(payload.type).toBe('template');
      expect(payload.template.name).toBe('order_update');
      expect(payload.template.language.code).toBe('es_MX');
      expect(payload.template.components).toBeDefined();
      expect(payload.template.components[0].parameters).toHaveLength(2);
      expect(payload.template.components[0].parameters[0].text).toBe(
        'Order #12345',
      );
      expect(payload.template.components[0].parameters[1].text).toBe(
        'Shipped',
      );
    });

    it('should use default language when templateLanguage is not provided', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: { address: '+50212345678' },
          content: {
            body: 'Hello World',
          },
          metadata: {
            notificationId: 'notif-pipe-002',
            templateName: 'hello_world',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const payload = mockSendMessage.mock.calls[0][0];
      expect(payload.type).toBe('template');
      expect(payload.template.name).toBe('hello_world');
      expect(payload.template.language.code).toBe('en');
    });

    it('should fall back to comma-separated body when templateParameters is absent', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: { address: '+50212345678' },
          content: {
            body: 'Value1, Value2, Value3',
          },
          metadata: {
            notificationId: 'notif-pipe-003',
            templateName: 'multi_param',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const payload = mockSendMessage.mock.calls[0][0];
      expect(payload.type).toBe('template');
      expect(payload.template.name).toBe('multi_param');
      expect(payload.template.components[0].parameters).toHaveLength(3);
      expect(payload.template.components[0].parameters[0].text).toBe('Value1');
      expect(payload.template.components[0].parameters[1].text).toBe('Value2');
      expect(payload.template.components[0].parameters[2].text).toBe('Value3');
    });

    it('should prioritize metadata.templateName over subject prefix', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: { address: '+50212345678' },
          content: {
            subject: 'template:wrong_template',
            body: 'Param1',
          },
          metadata: {
            notificationId: 'notif-pipe-004',
            templateName: 'correct_template',
            templateLanguage: 'en',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);

      const payload = mockSendMessage.mock.calls[0][0];
      expect(payload.type).toBe('template');
      expect(payload.template.name).toBe('correct_template');
    });
  });

  describe('SendResultDto shape', () => {
    it('should return all expected fields in success response', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'whatsapp',
          recipient: { address: '+50212345678' },
          content: {
            body: 'Shape test message',
          },
          metadata: {
            notificationId: 'notif-shape',
          },
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
});
