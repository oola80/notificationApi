import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';

describe('Health (e2e)', () => {
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

  it('GET /health should return enriched health response', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('uptime');
    expect(res.body).toHaveProperty('checks');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('GET /health should include database check', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.checks).toHaveProperty('database');
    expect(res.body.checks.database).toHaveProperty('status');
    expect(res.body.checks.database).toHaveProperty('latencyMs');
    expect(res.body.checks.database.status).toBe('up');
  });

  it('GET /health should include rabbitmq check', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.checks).toHaveProperty('rabbitmq');
    expect(res.body.checks.rabbitmq).toHaveProperty('status');
    expect(res.body.checks.rabbitmq.status).toBe('up');
  });

  it('GET /health should include queues info', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.checks).toHaveProperty('queues');
    expect(typeof res.body.checks.queues).toBe('object');
  });

  it('GET /health should include ruleCache info', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.checks).toHaveProperty('ruleCache');
    expect(res.body.checks.ruleCache).toHaveProperty('enabled');
    expect(res.body.checks.ruleCache).toHaveProperty('ruleCount');
  });

  it('GET /metrics should return Prometheus text format', async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('nes_events_consumed_total');
    expect(res.text).toContain('nes_notifications_created_total');
  });
});
