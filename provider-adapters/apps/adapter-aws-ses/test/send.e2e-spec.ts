import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, createMockSesClient } from './test-utils.js';

describe('AWS SES Adapter — POST /send (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let mockSesClient: ReturnType<typeof createMockSesClient>;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;
    mockSesClient = result.mockSesClient;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockSesClient.sendEmail.mockClear();
    mockSesClient.sendEmail.mockResolvedValue({
      messageId: '<test-message-id@us-east-1.amazonses.com>',
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
        '<test-message-id@us-east-1.amazonses.com>',
      );
      expect(res.body.httpStatus).toBe(200);
      expect(res.body.retryable).toBe(false);
      expect(res.body.errorMessage).toBeNull();
      expect(mockSesClient.sendEmail).toHaveBeenCalledTimes(1);
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
      expect(mockSesClient.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('SES returns auth error', () => {
    it('should return 200 with success=false, retryable=false', async () => {
      const error = new Error('Invalid login') as any;
      error.code = 'EAUTH';
      mockSesClient.sendEmail.mockRejectedValue(error);

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

  describe('SES returns network error', () => {
    it('should return 200 with success=false, retryable=true', async () => {
      const error = new Error('connect ECONNREFUSED') as any;
      error.code = 'ECONNREFUSED';
      mockSesClient.sendEmail.mockRejectedValue(error);

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
        '<test-message-id@us-east-1.amazonses.com>',
      );
      expect(mockSesClient.sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('AWS SDK error — ThrottlingException', () => {
    it('should return 200 with success=false, retryable=true for throttling', async () => {
      const error = new Error('Rate exceeded') as any;
      error.name = 'ThrottlingException';
      mockSesClient.sendEmail.mockRejectedValue(error);

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
            notificationId: 'notif-throttle',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(res.body.retryable).toBe(true);
    });
  });

  describe('AWS SDK error — MessageRejected', () => {
    it('should return 200 with success=false, retryable=false for rejected message', async () => {
      const error = new Error('Email content rejected') as any;
      error.name = 'MessageRejected';
      mockSesClient.sendEmail.mockRejectedValue(error);

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
            notificationId: 'notif-rejected',
          },
        })
        .expect(200);

      expect(res.body.success).toBe(false);
      expect(res.body.retryable).toBe(false);
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
