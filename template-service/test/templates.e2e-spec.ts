import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, cleanupTestData } from './test-utils.js';

describe('Templates (e2e)', () => {
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
    // Clean up test templates
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

  describe('POST /templates', () => {
    it('should create a template with multiple channels → 201', async () => {
      const res = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug: `e2e-create-${Date.now()}`,
          name: 'E2E Create Test',
          description: 'Test template for E2E',
          channels: [
            {
              channel: 'email',
              subject: 'Order {{orderId}}',
              body: 'Hello {{customerName}}, your order is confirmed.',
            },
            {
              channel: 'sms',
              body: 'Order {{orderId}} confirmed.',
            },
          ],
          createdBy: 'e2e-test',
        })
        .expect(201);

      createdIds.push(res.body.id);

      expect(res.body.id).toBeDefined();
      expect(res.body.slug).toContain('e2e-create-');
      expect(res.body.isActive).toBe(true);
      expect(res.body.versions).toHaveLength(1);
      expect(res.body.versions[0].versionNumber).toBe(1);
      expect(res.body.versions[0].channels).toHaveLength(2);
      expect(res.body.variables).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ variableName: 'orderId' }),
          expect.objectContaining({ variableName: 'customerName' }),
        ]),
      );
    });

    it('should return 409 on duplicate slug', async () => {
      const slug = `e2e-dup-${Date.now()}`;

      // Create first
      const res = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug,
          name: 'Dup Test 1',
          channels: [{ channel: 'sms', body: 'Hello' }],
        })
        .expect(201);

      createdIds.push(res.body.id);

      // Attempt duplicate
      await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug,
          name: 'Dup Test 2',
          channels: [{ channel: 'sms', body: 'World' }],
        })
        .expect(409)
        .expect((res) => {
          expect(res.body.code).toBe('TS-002');
        });
    });

    it('should return 400 on invalid Handlebars syntax', async () => {
      await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug: `e2e-bad-hbs-${Date.now()}`,
          name: 'Bad HBS',
          channels: [{ channel: 'email', subject: 'Test', body: '{{#if}}' }],
        })
        .expect(422)
        .expect((res) => {
          expect(res.body.code).toBe('TS-003');
        });
    });
  });

  describe('GET /templates', () => {
    it('should list templates with pagination → 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/templates')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.total).toBeDefined();
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
    });

    it('should filter by search term', async () => {
      const slug = `e2e-search-${Date.now()}`;
      const createRes = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug,
          name: 'Unique Search Target',
          channels: [{ channel: 'sms', body: 'Test' }],
        })
        .expect(201);

      createdIds.push(createRes.body.id);

      const res = await request(app.getHttpServer())
        .get('/templates')
        .query({ search: slug })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.some((t: any) => t.slug === slug)).toBe(true);
    });
  });

  describe('GET /templates/:id', () => {
    it('should return template with full relations → 200', async () => {
      const slug = `e2e-getbyid-${Date.now()}`;
      const createRes = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug,
          name: 'Get By ID Test',
          channels: [
            { channel: 'email', subject: 'Hello', body: 'World {{name}}' },
          ],
        })
        .expect(201);

      createdIds.push(createRes.body.id);
      const id = createRes.body.id;

      const res = await request(app.getHttpServer())
        .get(`/templates/${id}`)
        .expect(200);

      expect(res.body.id).toBe(id);
      expect(res.body.slug).toBe(slug);
      expect(res.body.versions).toBeDefined();
      expect(res.body.variables).toBeDefined();
    });

    it('should return 404 for non-existent template', async () => {
      await request(app.getHttpServer())
        .get('/templates/00000000-0000-0000-0000-000000000000')
        .expect(404)
        .expect((res) => {
          expect(res.body.code).toBe('TS-009');
        });
    });
  });

  describe('PUT /templates/:id', () => {
    it('should update template → new version created', async () => {
      const slug = `e2e-update-${Date.now()}`;
      const createRes = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug,
          name: 'Update Test',
          channels: [{ channel: 'sms', body: 'V1 content' }],
        })
        .expect(201);

      createdIds.push(createRes.body.id);
      const id = createRes.body.id;

      const updateRes = await request(app.getHttpServer())
        .put(`/templates/${id}`)
        .send({
          channels: [{ channel: 'sms', body: 'V2 content' }],
          changeSummary: 'Updated to v2',
          updatedBy: 'e2e-test',
        })
        .expect(200);

      expect(updateRes.body.versions.length).toBeGreaterThanOrEqual(2);
      const latestVersion = updateRes.body.versions.find(
        (v: any) => v.id === updateRes.body.currentVersionId,
      );
      expect(latestVersion.versionNumber).toBe(2);
    });
  });

  describe('DELETE /templates/:id', () => {
    it('should soft delete template → isActive = false', async () => {
      const slug = `e2e-delete-${Date.now()}`;
      const createRes = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug,
          name: 'Delete Test',
          channels: [{ channel: 'sms', body: 'To be deleted' }],
        })
        .expect(201);

      createdIds.push(createRes.body.id);
      const id = createRes.body.id;

      const deleteRes = await request(app.getHttpServer())
        .delete(`/templates/${id}`)
        .expect(200);

      expect(deleteRes.body.isActive).toBe(false);
    });
  });
});
