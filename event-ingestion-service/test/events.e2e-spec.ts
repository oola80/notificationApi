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
} from './test-utils.js';

const E2E_QUERY_SOURCE = 'e2e-query-source';
const E2E_QUERY_EVENT_TYPE = 'e2e.query.event';

describe('Events Query (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let dataSource: DataSource;
  let seededEventId: string;

  beforeAll(async () => {
    ({ app, module } = await createTestApp());
    dataSource = module.get<DataSource>(DataSource);

    // Clean up leftovers
    await cleanupTestData(dataSource, 'events', 'source_id = $1', [
      E2E_QUERY_SOURCE,
    ]);
    await cleanupTestData(dataSource, 'event_mappings', 'source_id = $1', [
      E2E_QUERY_SOURCE,
    ]);
    await cleanupTestData(dataSource, 'event_sources', 'name = $1', [
      E2E_QUERY_SOURCE,
    ]);

    // Seed source, mapping, and a dummy event
    await seedEventSource(dataSource, {
      name: E2E_QUERY_SOURCE,
      displayName: 'E2E Query Source',
      type: 'webhook',
      isActive: true,
    });

    await seedEventMapping(dataSource, {
      sourceId: E2E_QUERY_SOURCE,
      eventType: E2E_QUERY_EVENT_TYPE,
      name: 'E2E Query Mapping',
      fieldMappings: {
        orderId: { source: 'id', target: 'orderId', transform: 'direct' },
      },
    });

    // Insert a dummy event directly
    seededEventId = crypto.randomUUID();
    await dataSource.query(
      `INSERT INTO event_ingestion_service.events
        (event_id, source_id, cycle_id, event_type, raw_payload, status, correlation_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        seededEventId,
        E2E_QUERY_SOURCE,
        'e2e-query-cycle',
        E2E_QUERY_EVENT_TYPE,
        JSON.stringify({ id: 'query-order-123' }),
        'published',
        crypto.randomUUID(),
      ],
    );
  });

  afterAll(async () => {
    await cleanupTestData(dataSource, 'events', 'source_id = $1', [
      E2E_QUERY_SOURCE,
    ]);
    await cleanupTestData(dataSource, 'event_mappings', 'source_id = $1', [
      E2E_QUERY_SOURCE,
    ]);
    await cleanupTestData(dataSource, 'event_sources', 'name = $1', [
      E2E_QUERY_SOURCE,
    ]);
    await app.close();
  });

  it('GET /api/v1/events should return paginated result filtered by sourceId', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/events')
      .query({ sourceId: E2E_QUERY_SOURCE })
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.page).toBeDefined();
    expect(res.body.limit).toBeDefined();
  });

  it('GET /api/v1/events/:eventId should return the seeded event', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/events/${seededEventId}`)
      .expect(200);

    expect(res.body.eventId).toBe(seededEventId);
    expect(res.body.sourceId).toBe(E2E_QUERY_SOURCE);
  });

  it('GET /api/v1/events/:eventId should return 404 for non-existent event', async () => {
    const fakeUuid = '00000000-0000-4000-a000-000000000000';
    const res = await request(app.getHttpServer())
      .get(`/api/v1/events/${fakeUuid}`)
      .expect(404);

    expect(res.body.code).toBe('EIS-015');
  });
});
