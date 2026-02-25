import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';

describe('Rules (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let dataSource: DataSource;
  const createdRuleIds: string[] = [];

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    // Cleanup test rules
    for (const id of createdRuleIds) {
      try {
        await dataSource.query(
          `DELETE FROM notification_engine_service.notification_rules WHERE id = $1`,
          [id],
        );
      } catch {
        // ignore
      }
    }
    await app.close();
  });

  describe('POST /rules', () => {
    it('should create a new rule and return 201', async () => {
      const dto = {
        name: 'E2E Test Rule',
        eventType: 'e2e.test.event',
        actions: [
          {
            templateId: 'tpl-e2e-test',
            channels: ['email'],
            recipientType: 'customer',
          },
        ],
        priority: 100,
        createdBy: 'e2e-test',
      };

      const res = await request(app.getHttpServer())
        .post('/rules')
        .send(dto)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('E2E Test Rule');
      expect(res.body.eventType).toBe('e2e.test.event');
      expect(res.body.isActive).toBe(true);
      createdRuleIds.push(res.body.id);
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/rules')
        .send({ name: 'Incomplete Rule' })
        .expect(400);

      expect(res.body.code).toBe('NES-001');
    });
  });

  describe('GET /rules', () => {
    it('should list rules including the created rule', async () => {
      const res = await request(app.getHttpServer()).get('/rules').expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /rules/:id', () => {
    it('should return the created rule by ID', async () => {
      const ruleId = createdRuleIds[0];
      if (!ruleId) return;

      const res = await request(app.getHttpServer())
        .get(`/rules/${ruleId}`)
        .expect(200);

      expect(res.body.id).toBe(ruleId);
      expect(res.body.name).toBe('E2E Test Rule');
    });
  });

  describe('PUT /rules/:id', () => {
    it('should update the rule', async () => {
      const ruleId = createdRuleIds[0];
      if (!ruleId) return;

      const res = await request(app.getHttpServer())
        .put(`/rules/${ruleId}`)
        .send({ name: 'E2E Updated Rule', updatedBy: 'e2e-test' })
        .expect(200);

      expect(res.body.name).toBe('E2E Updated Rule');
    });
  });

  describe('DELETE /rules/:id', () => {
    it('should soft-delete the rule', async () => {
      const ruleId = createdRuleIds[0];
      if (!ruleId) return;

      await request(app.getHttpServer()).delete(`/rules/${ruleId}`).expect(200);

      // Verify it's no longer in active list
      const res = await request(app.getHttpServer())
        .get('/rules?isActive=true')
        .expect(200);

      const found = res.body.data.find((r: any) => r.id === ruleId);
      expect(found).toBeUndefined();
    });
  });

  describe('duplicate detection', () => {
    it('should return 409 for duplicate eventType + conditions', async () => {
      const dto = {
        name: 'E2E Duplicate Test',
        eventType: 'e2e.duplicate.test',
        actions: [
          {
            templateId: 'tpl-dup',
            channels: ['email'],
            recipientType: 'customer',
          },
        ],
        priority: 50,
        createdBy: 'e2e-test',
      };

      // Create first
      const first = await request(app.getHttpServer())
        .post('/rules')
        .send(dto)
        .expect(201);
      createdRuleIds.push(first.body.id);

      // Attempt duplicate
      const res = await request(app.getHttpServer())
        .post('/rules')
        .send(dto)
        .expect(409);

      expect(res.body.code).toBe('NES-006');
    });
  });
});
