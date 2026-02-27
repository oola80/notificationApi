import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';

describe('Mailgun Adapter — Health, Capabilities & Metrics (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return 200 with correct shape', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('providerId', 'mailgun');
      expect(res.body).toHaveProperty('providerName', 'Mailgun');
      expect(res.body).toHaveProperty('supportedChannels');
      expect(res.body.supportedChannels).toContain('email');
      expect(res.body).toHaveProperty('latencyMs');
      expect(typeof res.body.latencyMs).toBe('number');
      expect(res.body).toHaveProperty('details');
    });
  });

  describe('GET /capabilities', () => {
    it('should return 200 with Mailgun capabilities', async () => {
      const res = await request(app.getHttpServer())
        .get('/capabilities')
        .expect(200);

      expect(res.body).toEqual({
        providerId: 'mailgun',
        providerName: 'Mailgun',
        supportedChannels: ['email'],
        supportsAttachments: true,
        supportsMediaUrls: false,
        maxAttachmentSizeMb: 25,
        maxRecipientsPerRequest: 1000,
        webhookPath: '/webhooks/inbound',
      });
    });
  });

  describe('GET /metrics', () => {
    it('should return 200 with Prometheus text format', async () => {
      const res = await request(app.getHttpServer())
        .get('/metrics')
        .expect(200);

      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('adapter_send_total');
      expect(res.text).toContain('adapter_health_status');
      expect(res.text).toContain('adapter_send_duration_seconds');
    });
  });
});
