import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';

describe('Health & Metrics (e2e)', () => {
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

  it('GET /health should return 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('GET /ready should return readiness with checks', async () => {
    const res = await request(app.getHttpServer()).get('/ready').expect(200);

    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('checks');
    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks).toHaveProperty('rabbitmq');
  });

  it('GET /metrics should return Prometheus text format', async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('channel_router_delivery_total');
    expect(res.text).toContain('channel_router_circuit_breaker_state');
  });
});
