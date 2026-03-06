import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp, cleanupTestData } from './test-utils.js';

const E2E_CRUD_SOURCE = 'e2e-crud-source';
const E2E_CRUD_EVENT_TYPE = 'e2e.crud.event';

describe('Event Mappings CRUD (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let dataSource: DataSource;
  let createdMappingId: string;

  const validDto = {
    sourceId: E2E_CRUD_SOURCE,
    eventType: E2E_CRUD_EVENT_TYPE,
    name: 'E2E CRUD Test Mapping',
    fieldMappings: {
      orderId: { source: 'id', target: 'orderId', transform: 'direct' },
    },
    priority: 'normal',
  };

  beforeAll(async () => {
    ({ app, module } = await createTestApp());
    dataSource = module.get<DataSource>(DataSource);

    // Clean up leftover data
    await cleanupTestData(dataSource, 'event_mappings', 'source_id = $1', [
      E2E_CRUD_SOURCE,
    ]);
  });

  afterAll(async () => {
    await cleanupTestData(dataSource, 'event_mappings', 'source_id = $1', [
      E2E_CRUD_SOURCE,
    ]);
    await app.close();
  });

  it('POST /api/v1/event-mappings should create mapping and return 201', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/event-mappings')
      .send(validDto)
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.sourceId).toBe(E2E_CRUD_SOURCE);
    expect(res.body.eventType).toBe(E2E_CRUD_EVENT_TYPE);
    expect(res.body.name).toBe(validDto.name);
    createdMappingId = res.body.id;
  });

  it('GET /api/v1/event-mappings should return paginated list', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/event-mappings')
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.total).toBeDefined();
    expect(res.body.page).toBeDefined();
    expect(res.body.limit).toBeDefined();
  });

  it('GET /api/v1/event-mappings/:id should return the mapping', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/event-mappings/${createdMappingId}`)
      .expect(200);

    expect(res.body.id).toBe(createdMappingId);
    expect(res.body.sourceId).toBe(E2E_CRUD_SOURCE);
  });

  it('PUT /api/v1/event-mappings/:id should update the mapping', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/event-mappings/${createdMappingId}`)
      .send({ name: 'Updated E2E' })
      .expect(200);

    expect(res.body.name).toBe('Updated E2E');
  });

  it('POST /api/v1/event-mappings/:id/test should return canonicalEvent', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/event-mappings/${createdMappingId}/test`)
      .send({
        samplePayload: { id: 'test-order-123', amount: 42.0 },
        cycleId: 'test-cycle',
      })
      .expect(200);

    expect(res.body).toBeDefined();
    expect(res.body.canonicalEvent).toBeDefined();
  });

  it('POST duplicate sourceId+eventType should return 409 with code EIS-009', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/event-mappings')
      .send(validDto)
      .expect(409);

    expect(res.body.code).toBe('EIS-009');
  });

  it('DELETE /api/v1/event-mappings/:id should soft-delete and return 204', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/event-mappings/${createdMappingId}`)
      .expect(204);
  });
});
