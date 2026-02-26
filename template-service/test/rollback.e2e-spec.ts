import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, cleanupTestData } from './test-utils.js';

describe('Rollback (e2e)', () => {
  let app: INestApplication;
  let module: TestingModule;
  let dataSource: DataSource;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
    module = testApp.module;
    dataSource = module.get(DataSource);
  });

  afterAll(async () => {
    for (const id of createdIds) {
      await cleanupTestData(
        dataSource,
        'template_service.template_variables',
        'template_id = $1',
        [id],
      );
      await cleanupTestData(
        dataSource,
        'template_service.template_channels',
        'template_version_id IN (SELECT id FROM template_service.template_versions WHERE template_id = $1)',
        [id],
      );
      await cleanupTestData(
        dataSource,
        'template_service.template_versions',
        'template_id = $1',
        [id],
      );
      await cleanupTestData(
        dataSource,
        'template_service.templates',
        'id = $1',
        [id],
      );
    }
    await app.close();
  });

  describe('POST /templates/:id/rollback', () => {
    it('should rollback from v2 to v1 and verify current version', async () => {
      // Create template (v1)
      const createRes = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug: `e2e-rollback-${Date.now()}`,
          name: 'Rollback Test',
          channels: [{ channel: 'sms', body: 'V1 content' }],
        })
        .expect(201);

      const id = createRes.body.id;
      createdIds.push(id);

      // Update to v2
      await request(app.getHttpServer())
        .put(`/templates/${id}`)
        .send({
          channels: [{ channel: 'sms', body: 'V2 content' }],
          changeSummary: 'Updated to v2',
        })
        .expect(200);

      // Verify we are at v2
      const beforeRollback = await request(app.getHttpServer())
        .get(`/templates/${id}`)
        .expect(200);

      const v2Version = beforeRollback.body.versions.find(
        (v: any) => v.id === beforeRollback.body.currentVersionId,
      );
      expect(v2Version.versionNumber).toBe(2);

      // Rollback to v1
      const rollbackRes = await request(app.getHttpServer())
        .post(`/templates/${id}/rollback`)
        .send({ versionNumber: 1 })
        .expect(200);

      // Verify current version is v1
      const currentVersion = rollbackRes.body.versions.find(
        (v: any) => v.id === rollbackRes.body.currentVersionId,
      );
      expect(currentVersion.versionNumber).toBe(1);
    });

    it('should return 400 when rolling back to non-existent version', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug: `e2e-rollback-bad-${Date.now()}`,
          name: 'Rollback Bad Version',
          channels: [{ channel: 'sms', body: 'Content' }],
        })
        .expect(201);

      createdIds.push(createRes.body.id);

      await request(app.getHttpServer())
        .post(`/templates/${createRes.body.id}/rollback`)
        .send({ versionNumber: 99 })
        .expect(400)
        .expect((res) => {
          expect(res.body.code).toBe('TS-011');
        });
    });

    it('should return 400 when already at the target version', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug: `e2e-rollback-same-${Date.now()}`,
          name: 'Rollback Same Version',
          channels: [{ channel: 'sms', body: 'Content' }],
        })
        .expect(201);

      createdIds.push(createRes.body.id);

      await request(app.getHttpServer())
        .post(`/templates/${createRes.body.id}/rollback`)
        .send({ versionNumber: 1 })
        .expect(400)
        .expect((res) => {
          expect(res.body.code).toBe('TS-011');
          expect(res.body.message).toContain('already at version');
        });
    });

    it('should return 404 for non-existent template', async () => {
      await request(app.getHttpServer())
        .post('/templates/00000000-0000-0000-0000-000000000000/rollback')
        .send({ versionNumber: 1 })
        .expect(404)
        .expect((res) => {
          expect(res.body.code).toBe('TS-009');
        });
    });
  });
});
