import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';

describe('Critical Channel Overrides (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let dataSource: DataSource;
  const createdOverrideIds: string[] = [];

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    for (const id of createdOverrideIds) {
      try {
        await dataSource.query(
          `DELETE FROM notification_engine_service.critical_channel_overrides WHERE id = $1`,
          [id],
        );
      } catch {
        // ignore
      }
    }
    await app.close();
  });

  describe('POST /critical-channel-overrides', () => {
    it('should create an override and return 201', async () => {
      const dto = {
        eventType: `e2e.override.${Date.now()}`,
        channel: 'email',
        reason: 'E2E test override',
        createdBy: 'e2e-test',
      };

      const res = await request(app.getHttpServer())
        .post('/critical-channel-overrides')
        .send(dto)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.eventType).toBe(dto.eventType);
      expect(res.body.channel).toBe('email');
      expect(res.body.isActive).toBe(true);
      createdOverrideIds.push(res.body.id);
    });
  });

  describe('GET /critical-channel-overrides', () => {
    it('should list overrides', async () => {
      const res = await request(app.getHttpServer())
        .get('/critical-channel-overrides')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /critical-channel-overrides/:id', () => {
    it('should return the created override by ID', async () => {
      const overrideId = createdOverrideIds[0];
      if (!overrideId) return;

      const res = await request(app.getHttpServer())
        .get(`/critical-channel-overrides/${overrideId}`)
        .expect(200);

      expect(res.body.id).toBe(overrideId);
    });
  });

  describe('PUT /critical-channel-overrides/:id', () => {
    it('should update the reason', async () => {
      const overrideId = createdOverrideIds[0];
      if (!overrideId) return;

      const res = await request(app.getHttpServer())
        .put(`/critical-channel-overrides/${overrideId}`)
        .send({ reason: 'Updated by E2E test', updatedBy: 'e2e-test' })
        .expect(200);

      expect(res.body.reason).toBe('Updated by E2E test');
    });
  });

  describe('DELETE /critical-channel-overrides/:id', () => {
    it('should soft-delete the override', async () => {
      const overrideId = createdOverrideIds[0];
      if (!overrideId) return;

      await request(app.getHttpServer())
        .delete(`/critical-channel-overrides/${overrideId}`)
        .expect(200);
    });
  });

  describe('duplicate detection', () => {
    it('should return 409 for duplicate eventType + channel', async () => {
      const eventType = `e2e.dup.${Date.now()}`;
      const dto = {
        eventType,
        channel: 'sms',
        reason: 'Duplicate test',
        createdBy: 'e2e-test',
      };

      const first = await request(app.getHttpServer())
        .post('/critical-channel-overrides')
        .send(dto)
        .expect(201);
      createdOverrideIds.push(first.body.id);

      const res = await request(app.getHttpServer())
        .post('/critical-channel-overrides')
        .send(dto)
        .expect(409);

      expect(res.body.code).toBe('NES-011');
    });
  });
});
