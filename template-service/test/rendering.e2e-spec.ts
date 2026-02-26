import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, cleanupTestData } from './test-utils.js';

describe('Rendering (e2e)', () => {
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

  let templateId: string;

  describe('Setup: Create template for rendering tests', () => {
    it('should create a multi-channel template', async () => {
      const res = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug: `e2e-render-${Date.now()}`,
          name: 'Render Test Template',
          channels: [
            {
              channel: 'email',
              subject: 'Order {{orderId}} Confirmed',
              body: 'Dear {{customerName}}, your order #{{orderId}} is confirmed.',
            },
            {
              channel: 'sms',
              body: 'Order {{orderId}} confirmed. Thank you {{customerName}}!',
            },
          ],
          createdBy: 'e2e-test',
        })
        .expect(201);

      templateId = res.body.id;
      createdIds.push(templateId);
    });
  });

  describe('POST /templates/:id/render', () => {
    it('should render template with valid data → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/templates/${templateId}/render`)
        .send({
          channel: 'email',
          data: { orderId: 'ORD-123', customerName: 'John Doe' },
        })
        .expect(200);

      expect(res.body.rendered).toBeDefined();
      expect(res.body.rendered.subject).toBe('Order ORD-123 Confirmed');
      expect(res.body.rendered.body).toContain('John Doe');
      expect(res.body.rendered.body).toContain('ORD-123');
      expect(res.body.metadata).toBeDefined();
      expect(res.body.metadata.channel).toBe('email');
      expect(res.body.metadata.versionNumber).toBe(1);
      expect(typeof res.body.metadata.renderDurationMs).toBe('number');
    });

    it('should render inactive template → 422', async () => {
      // Create and soft-delete a template
      const createRes = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug: `e2e-inactive-render-${Date.now()}`,
          name: 'Inactive Render Test',
          channels: [{ channel: 'sms', body: 'Hello {{name}}' }],
        })
        .expect(201);

      createdIds.push(createRes.body.id);

      await request(app.getHttpServer())
        .delete(`/templates/${createRes.body.id}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/templates/${createRes.body.id}/render`)
        .send({
          channel: 'sms',
          data: { name: 'Test' },
        })
        .expect(422)
        .expect((res) => {
          expect(res.body.code).toBe('TS-004');
        });
    });

    it('should render with specific version number', async () => {
      const res = await request(app.getHttpServer())
        .post(`/templates/${templateId}/render`)
        .send({
          channel: 'sms',
          data: { orderId: 'ORD-456', customerName: 'Jane' },
          versionNumber: 1,
        })
        .expect(200);

      expect(res.body.metadata.versionNumber).toBe(1);
      expect(res.body.rendered.body).toContain('ORD-456');
    });

    it('should return warning for long SMS output', async () => {
      // Create template with body that will produce long SMS
      const longSlug = `e2e-long-sms-${Date.now()}`;
      const createRes = await request(app.getHttpServer())
        .post('/templates')
        .send({
          slug: longSlug,
          name: 'Long SMS Test',
          channels: [
            {
              channel: 'sms',
              body: '{{longText}}',
            },
          ],
        })
        .expect(201);

      createdIds.push(createRes.body.id);

      const res = await request(app.getHttpServer())
        .post(`/templates/${createRes.body.id}/render`)
        .send({
          channel: 'sms',
          data: { longText: 'A'.repeat(200) },
        })
        .expect(200);

      expect(res.body.warnings.length).toBeGreaterThan(0);
      expect(res.body.warnings[0]).toContain('SMS body exceeds');
    });
  });

  describe('POST /templates/:id/preview', () => {
    it('should preview all channels → 200', async () => {
      const res = await request(app.getHttpServer())
        .post(`/templates/${templateId}/preview`)
        .send({
          data: { orderId: 'ORD-789', customerName: 'Preview User' },
        })
        .expect(200);

      expect(res.body.previews).toBeDefined();
      expect(res.body.previews).toHaveLength(2);
      expect(res.body.metadata).toBeDefined();
      expect(res.body.metadata.versionNumber).toBe(1);

      const emailPreview = res.body.previews.find(
        (p: any) => p.channel === 'email',
      );
      expect(emailPreview).toBeDefined();
      expect(emailPreview.subject).toContain('ORD-789');
      expect(emailPreview.body).toContain('Preview User');

      const smsPreview = res.body.previews.find(
        (p: any) => p.channel === 'sms',
      );
      expect(smsPreview).toBeDefined();
      expect(smsPreview.body).toContain('ORD-789');
    });
  });
});
