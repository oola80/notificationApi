import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';
import { MailgunClientService } from '../src/mailgun-client/mailgun-client.service.js';

describe('Mailgun Adapter — POST /send (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let mockSendMessage: jest.Mock;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;

    // Mock the MailgunClientService.sendMessage to avoid real API calls
    const mailgunClient = module.get(MailgunClientService);
    mockSendMessage = jest
      .fn()
      .mockResolvedValue({
        id: '<20230101120000.abc123@distelsa.info>',
        message: 'Queued. Thank you.',
      });
    mailgunClient.sendMessage = mockSendMessage;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockSendMessage.mockClear();
    mockSendMessage.mockResolvedValue({
      id: '<20230101120000.abc123@distelsa.info>',
      message: 'Queued. Thank you.',
    });
  });

  describe('Valid email request', () => {
    it('should return 200 with success=true and providerMessageId', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'email',
          recipient: { address: 'user@example.com' },
          content: {
            subject: 'Test Subject',
            body: '<p>Hello World</p>',
          },
          metadata: {
            notificationId: 'notif-123',
            correlationId: 'corr-456',
            cycleId: 'cycle-789',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.providerMessageId).toBe(
        '<20230101120000.abc123@distelsa.info>',
      );
      expect(res.body.httpStatus).toBe(200);
      expect(res.body.retryable).toBe(false);
      expect(res.body.errorMessage).toBeNull();
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('Invalid body — missing recipient', () => {
    it('should return 400 validation error', async () => {
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
  });

  describe('Non-email channel', () => {
    it('should return 200 with success=false for SMS channel', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'sms',
          recipient: { address: '+15551234567' },
          content: {
            body: 'Hello via SMS',
          },
          metadata: {
            notificationId: 'notif-123',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(res.body.errorMessage).toContain('sms');
      expect(res.body.retryable).toBe(false);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Mailgun API returns 429', () => {
    it('should return 200 with success=false, retryable=true', async () => {
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
          content: {
            subject: 'Test',
            body: '<p>Hello</p>',
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

  describe('Mailgun API returns 401', () => {
    it('should return 200 with success=false, retryable=false', async () => {
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
          content: {
            subject: 'Test',
            body: '<p>Hello</p>',
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

  describe('Email with Base64 attachment', () => {
    it('should include attachment in send and return success', async () => {
      const base64Content = Buffer.from('PDF file content').toString('base64');

      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'email',
          recipient: { address: 'user@example.com' },
          content: {
            subject: 'With Attachment',
            body: '<p>See attached</p>',
            media: [
              {
                url: base64Content,
                contentType: 'application/pdf',
                filename: 'report.pdf',
              },
            ],
          },
          metadata: {
            notificationId: 'notif-456',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.providerMessageId).toBe(
        '<20230101120000.abc123@distelsa.info>',
      );
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('SendResultDto shape', () => {
    it('should return all expected fields in success response', async () => {
      const res = await request(app.getHttpServer())
        .post('/send')
        .send({
          channel: 'email',
          recipient: { address: 'user@example.com' },
          content: {
            subject: 'Shape Test',
            body: '<p>Testing shape</p>',
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
