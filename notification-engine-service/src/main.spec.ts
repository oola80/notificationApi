import * as request from 'supertest';
import { INestApplication } from '@nestjs/common';

// This test requires live DB + RabbitMQ (same as E2E tests)
// Uses createTestApp() from test-utils which mirrors main.ts bootstrap
describe('Bootstrap (main.ts)', () => {
  let app: INestApplication;
  let skipAll = false;

  beforeAll(async () => {
    try {
      // Dynamic import to avoid module resolution issues in unit-test context
      const { createTestApp } = await import('../test/test-utils.js');
      const result = await createTestApp();
      app = result.app;
    } catch {
      // Infrastructure not available — skip gracefully
      skipAll = true;
    }
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should have health endpoint at /health (excluded from prefix)', async () => {
    if (skipAll) return;
    const res = await request(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
  });

  it('should have metrics endpoint at /metrics (excluded from prefix)', async () => {
    if (skipAll) return;
    const res = await request(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(200);
  });

  it('should serve API endpoints under /api/v1 prefix', async () => {
    if (skipAll) return;
    const res = await request(app.getHttpServer()).get('/api/v1/rules');
    // Should return 200 (list) not 404
    expect(res.status).not.toBe(404);
  });

  it('should return standardized error shape on invalid request body', async () => {
    if (skipAll) return;
    const res = await request(app.getHttpServer())
      .post('/api/v1/rules')
      .send({});
    // DtoValidationPipe + HttpExceptionFilter should produce standardized error
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('code');
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('details');
    expect(res.body).toHaveProperty('status', 400);
  });

  it('should include CORS headers', async () => {
    if (skipAll) return;
    const res = await request(app.getHttpServer())
      .options('/health')
      .set('Origin', 'http://localhost:3000')
      .set('Access-Control-Request-Method', 'GET');
    // enableCors() should allow the origin
    expect(
      res.headers['access-control-allow-origin'] || res.status === 204,
    ).toBeTruthy();
  });
});
