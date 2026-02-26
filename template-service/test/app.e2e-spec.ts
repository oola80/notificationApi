import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './test-utils.js';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('should return healthy status with all checks', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.service).toBe('template-service');
          expect(res.body.version).toBe('0.0.1');
          expect(res.body.status).toBeDefined();
          expect(typeof res.body.uptime).toBe('number');
          expect(res.body.checks).toBeDefined();
          expect(res.body.checks.database).toBeDefined();
          expect(res.body.checks.database.status).toBe('up');
          expect(typeof res.body.checks.database.latencyMs).toBe('number');
          expect(res.body.checks.rabbitmq).toBeDefined();
          expect(res.body.checks.cache).toBeDefined();
          expect(typeof res.body.checks.cache.size).toBe('number');
          expect(typeof res.body.checks.cache.maxSize).toBe('number');
        });
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus metrics', () => {
      return request(app.getHttpServer())
        .get('/metrics')
        .expect(200)
        .expect((res) => {
          expect(res.text).toContain('ts_template_render_total');
          expect(res.text).toContain('ts_template_cache_size');
        });
    });
  });
});
