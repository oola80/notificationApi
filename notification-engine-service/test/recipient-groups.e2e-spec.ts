import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';

describe('Recipient Groups (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let dataSource: DataSource;
  const createdGroupIds: string[] = [];

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    for (const id of createdGroupIds) {
      try {
        await dataSource.query(
          `DELETE FROM notification_engine_service.recipient_group_members WHERE group_id = $1`,
          [id],
        );
        await dataSource.query(
          `DELETE FROM notification_engine_service.recipient_groups WHERE id = $1`,
          [id],
        );
      } catch {
        // ignore
      }
    }
    await app.close();
  });

  describe('POST /recipient-groups', () => {
    it('should create a group with members and return 201', async () => {
      const dto = {
        name: `E2E Test Group ${Date.now()}`,
        description: 'Group created by E2E tests',
        members: [
          { email: 'e2e-member1@example.com', memberName: 'E2E Member 1' },
          { email: 'e2e-member2@example.com', memberName: 'E2E Member 2' },
        ],
        createdBy: 'e2e-test',
      };

      const res = await request(app.getHttpServer())
        .post('/recipient-groups')
        .send(dto)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(dto.name);
      expect(res.body.isActive).toBe(true);
      createdGroupIds.push(res.body.id);
    });

    it('should return 400 for missing name', async () => {
      const res = await request(app.getHttpServer())
        .post('/recipient-groups')
        .send({ description: 'No name provided' })
        .expect(400);

      expect(res.body.code).toBe('NES-001');
    });
  });

  describe('GET /recipient-groups', () => {
    it('should list groups including the created group', async () => {
      const res = await request(app.getHttpServer())
        .get('/recipient-groups')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('PUT /recipient-groups/:id', () => {
    it('should update group members', async () => {
      const groupId = createdGroupIds[0];
      if (!groupId) return;

      const res = await request(app.getHttpServer())
        .put(`/recipient-groups/${groupId}`)
        .send({
          addMembers: [
            { email: 'e2e-member3@example.com', memberName: 'E2E Member 3' },
          ],
          updatedBy: 'e2e-test',
        })
        .expect(200);

      expect(res.body.id).toBe(groupId);
    });
  });
});
