import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  cleanupTestData,
  seedEventSource,
  seedEventMapping,
  E2E_SOURCE_NAME,
  E2E_EVENT_TYPE,
} from './test-utils.js';

describe('Webhook Pipeline (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, module } = await createTestApp());
    dataSource = module.get<DataSource>(DataSource);

    // Clean up any leftover data from previous runs
    await cleanupTestData(dataSource, 'events', 'source_id = $1', [
      E2E_SOURCE_NAME,
    ]);
    await cleanupTestData(dataSource, 'event_mappings', 'source_id = $1', [
      E2E_SOURCE_NAME,
    ]);
    await cleanupTestData(dataSource, 'event_sources', 'name = $1', [
      E2E_SOURCE_NAME,
    ]);
    await cleanupTestData(dataSource, 'events', 'source_id = $1', [
      'e2e-inactive-source',
    ]);
    await cleanupTestData(dataSource, 'event_sources', 'name = $1', [
      'e2e-inactive-source',
    ]);

    // Seed active source and mapping
    await seedEventSource(dataSource, {
      name: E2E_SOURCE_NAME,
      displayName: 'E2E Test Source',
      type: 'webhook',
      isActive: true,
    });

    await seedEventMapping(dataSource, {
      sourceId: E2E_SOURCE_NAME,
      eventType: E2E_EVENT_TYPE,
      name: 'E2E Test Mapping',
      fieldMappings: {
        orderId: { source: 'id', target: 'orderId', transform: 'direct' },
      },
      priority: 'normal',
    });
  });

  afterAll(async () => {
    // Clean up in reverse order (events → mappings → sources)
    await cleanupTestData(dataSource, 'events', 'source_id = $1', [
      E2E_SOURCE_NAME,
    ]);
    await cleanupTestData(dataSource, 'event_mappings', 'source_id = $1', [
      E2E_SOURCE_NAME,
    ]);
    await cleanupTestData(dataSource, 'event_sources', 'name = $1', [
      E2E_SOURCE_NAME,
    ]);
    await cleanupTestData(dataSource, 'events', 'source_id = $1', [
      'e2e-inactive-source',
    ]);
    await cleanupTestData(dataSource, 'event_sources', 'name = $1', [
      'e2e-inactive-source',
    ]);
    await app.close();
  });

  it('should return 202 with eventId, correlationId, status=published for valid payload', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/events')
      .send({
        sourceId: E2E_SOURCE_NAME,
        cycleId: 'e2e-cycle-001',
        eventType: E2E_EVENT_TYPE,
        payload: { id: 'order-123', total: 99.99 },
      })
      .expect(202);

    expect(res.body.eventId).toBeDefined();
    expect(res.body.correlationId).toBeDefined();
    expect(res.body.status).toBe('published');
  });

  it('should return 200 with status=duplicate for duplicate sourceEventId', async () => {
    const uniqueSourceEventId = `e2e-dedup-${Date.now()}`;

    // First request
    await request(app.getHttpServer())
      .post('/api/v1/webhooks/events')
      .send({
        sourceId: E2E_SOURCE_NAME,
        cycleId: 'e2e-cycle-dedup',
        eventType: E2E_EVENT_TYPE,
        sourceEventId: uniqueSourceEventId,
        payload: { id: 'order-dup', total: 50.0 },
      })
      .expect(202);

    // Second request with same sourceEventId
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/events')
      .send({
        sourceId: E2E_SOURCE_NAME,
        cycleId: 'e2e-cycle-dedup',
        eventType: E2E_EVENT_TYPE,
        sourceEventId: uniqueSourceEventId,
        payload: { id: 'order-dup', total: 50.0 },
      })
      .expect(200);

    expect(res.body.status).toBe('duplicate');
  });

  it('should return 404 with code EIS-003 for unknown sourceId', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/events')
      .send({
        sourceId: 'nonexistent-e2e',
        cycleId: 'e2e-cycle-unknown',
        eventType: E2E_EVENT_TYPE,
        payload: { id: 'order-unknown' },
      })
      .expect(404);

    expect(res.body.code).toBe('EIS-003');
  });

  it('should return 422 with code EIS-008 for inactive source', async () => {
    // Seed an inactive source
    await seedEventSource(dataSource, {
      name: 'e2e-inactive-source',
      displayName: 'E2E Inactive',
      type: 'webhook',
      isActive: false,
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/events')
      .send({
        sourceId: 'e2e-inactive-source',
        cycleId: 'e2e-cycle-inactive',
        eventType: E2E_EVENT_TYPE,
        payload: { id: 'order-inactive' },
      })
      .expect(422);

    expect(res.body.code).toBe('EIS-008');
  });

  it('should return 400 with code EIS-001 for missing required body fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/webhooks/events')
      .send({})
      .expect(400);

    expect(res.body.code).toBe('EIS-001');
  });

  it('should return 429 when rate limit is exceeded', async () => {
    // Seed a source with very low rate limit
    await cleanupTestData(dataSource, 'events', 'source_id = $1', [
      'e2e-ratelimit-source',
    ]);
    await cleanupTestData(dataSource, 'event_mappings', 'source_id = $1', [
      'e2e-ratelimit-source',
    ]);
    await cleanupTestData(dataSource, 'event_sources', 'name = $1', [
      'e2e-ratelimit-source',
    ]);

    await seedEventSource(dataSource, {
      name: 'e2e-ratelimit-source',
      displayName: 'E2E Rate Limit',
      type: 'webhook',
      isActive: true,
      rateLimit: 1,
    });

    await seedEventMapping(dataSource, {
      sourceId: 'e2e-ratelimit-source',
      eventType: E2E_EVENT_TYPE,
      name: 'E2E Rate Limit Mapping',
      fieldMappings: {
        orderId: { source: 'id', target: 'orderId', transform: 'direct' },
      },
    });

    const payload = {
      sourceId: 'e2e-ratelimit-source',
      cycleId: 'e2e-cycle-rl',
      eventType: E2E_EVENT_TYPE,
      payload: { id: 'order-rl' },
    };

    // Fire multiple rapid requests; at least one should be rate-limited
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/api/v1/webhooks/events')
          .send(payload),
      ),
    );

    const statuses = results.map((r) => r.status);
    const has429 = statuses.includes(429);
    const hasRateLimitCode = results.some((r) => r.body.code === 'EIS-017');

    // At least one request should be rate-limited
    expect(has429 || hasRateLimitCode).toBe(true);

    // Cleanup
    await cleanupTestData(dataSource, 'events', 'source_id = $1', [
      'e2e-ratelimit-source',
    ]);
    await cleanupTestData(dataSource, 'event_mappings', 'source_id = $1', [
      'e2e-ratelimit-source',
    ]);
    await cleanupTestData(dataSource, 'event_sources', 'name = $1', [
      'e2e-ratelimit-source',
    ]);
  });
});
