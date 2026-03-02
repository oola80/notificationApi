import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';
import { WhatsAppClientService } from '../src/whatsapp-client/whatsapp-client.service.js';

describe('WhatsApp Adapter — Order Delay Template E2E', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let mockSendMessage: jest.Mock;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;

    const whatsappClient = module.get(WhatsAppClientService);
    mockSendMessage = jest.fn().mockResolvedValue({
      messaging_product: 'whatsapp',
      contacts: [{ input: '50212345678', wa_id: '50212345678' }],
      messages: [{ id: 'wamid.OrderDelay123' }],
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
      messages: [{ id: 'wamid.OrderDelay123' }],
    });
  });

  it('should send order_delay template to Meta API with correct structure', async () => {
    const res = await request(app.getHttpServer())
      .post('/send')
      .send({
        channel: 'whatsapp',
        recipient: { address: '+50212345678' },
        content: {
          body: 'Hola Juan, lamentamos informarle que su orden ORD-123 se encuentra retrasada.',
        },
        metadata: {
          notificationId: 'notif-order-delay-001',
          templateName: 'order_delay',
          templateLanguage: 'es_MX',
          templateParameters: ['Juan', 'ORD-123'],
        },
      })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.providerMessageId).toBe('wamid.OrderDelay123');

    // THE KEY ASSERTION: verify the exact JSON sent to Meta
    const metaPayload = mockSendMessage.mock.calls[0][0];
    expect(metaPayload).toEqual({
      messaging_product: 'whatsapp',
      to: '50212345678',
      type: 'template',
      template: {
        name: 'order_delay',
        language: { code: 'es_MX' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Juan' },
              { type: 'text', text: 'ORD-123' },
            ],
          },
        ],
      },
    });
  });

  it('should NOT produce type=text or type=document for order_delay', async () => {
    await request(app.getHttpServer())
      .post('/send')
      .send({
        channel: 'whatsapp',
        recipient: { address: '+50212345678' },
        content: { body: 'rendered text' },
        metadata: {
          notificationId: 'notif-order-delay-002',
          templateName: 'order_delay',
          templateLanguage: 'es_MX',
          templateParameters: ['Juan', 'ORD-123'],
        },
      })
      .expect(200);

    const metaPayload = mockSendMessage.mock.calls[0][0];
    expect(metaPayload.type).toBe('template');
    expect(metaPayload.type).not.toBe('text');
    expect(metaPayload.type).not.toBe('document');
    expect(metaPayload.template).toBeDefined();
    expect(metaPayload.text).toBeUndefined();
    expect(metaPayload.document).toBeUndefined();
  });

  it('email channel should be rejected by WhatsApp adapter (email unaffected)', async () => {
    const res = await request(app.getHttpServer())
      .post('/send')
      .send({
        channel: 'email',
        recipient: { address: 'juan@example.com' },
        content: { subject: 'Aviso', body: '<p>Order delayed</p>' },
        metadata: { notificationId: 'notif-email-001' },
      })
      .expect(200);

    expect(res.body.success).toBe(false);
    expect(res.body.errorMessage).toContain('email');
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
