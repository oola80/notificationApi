import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';

describe('Providers (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let registeredProviderId: string;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;
  });

  afterAll(async () => {
    // Clean up any test providers
    if (registeredProviderId) {
      try {
        await request(app.getHttpServer())
          .delete(`/providers/${registeredProviderId}`)
          .expect(204);
      } catch {
        // Ignore cleanup errors
      }
    }
    await app?.close();
  });

  describe('GET /providers', () => {
    it('should return a list of providers', async () => {
      const response = await request(app.getHttpServer())
        .get('/providers')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('POST /providers/register', () => {
    it('should return 400 for missing required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/providers/register')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('code', 'CRS-001');
    });

    it('should return 400 for invalid channel', async () => {
      const response = await request(app.getHttpServer())
        .post('/providers/register')
        .send({
          providerName: 'Test',
          providerId: 'test',
          channel: 'fax',
          adapterUrl: 'http://test:3170',
        })
        .expect(400);

      expect(response.body).toHaveProperty('code', 'CRS-001');
    });

    it('should register a new provider (adapter may be unreachable in test)', async () => {
      const response = await request(app.getHttpServer())
        .post('/providers/register')
        .send({
          providerName: 'TestProvider',
          providerId: 'test-e2e',
          channel: 'email',
          adapterUrl: 'http://test-adapter-e2e:9999',
          routingWeight: 50,
          rateLimitTokensPerSec: 10,
          rateLimitMaxBurst: 20,
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.providerName).toBe('TestProvider');
      expect(response.body.providerId).toBe('test-e2e');
      expect(response.body.channel).toBe('email');
      registeredProviderId = response.body.id;
    });

    it('should return 409 for duplicate adapter URL', async () => {
      if (!registeredProviderId) return;

      const response = await request(app.getHttpServer())
        .post('/providers/register')
        .send({
          providerName: 'Duplicate',
          providerId: 'dup-e2e',
          channel: 'email',
          adapterUrl: 'http://test-adapter-e2e:9999',
        })
        .expect(409);

      expect(response.body.code).toBe('CRS-020');
    });
  });

  describe('PUT /providers/:id/config', () => {
    it('should update provider config', async () => {
      if (!registeredProviderId) return;

      const response = await request(app.getHttpServer())
        .put(`/providers/${registeredProviderId}/config`)
        .send({ routingWeight: 80 })
        .expect(200);

      expect(response.body.routingWeight).toBe(80);
    });

    it('should return 404 for non-existent provider', async () => {
      const response = await request(app.getHttpServer())
        .put('/providers/00000000-0000-0000-0000-000000000000/config')
        .send({ routingWeight: 50 })
        .expect(404);

      expect(response.body.code).toBe('CRS-009');
    });
  });

  describe('GET /providers/:id/capabilities', () => {
    it('should return 503 when adapter is unreachable', async () => {
      if (!registeredProviderId) return;

      const response = await request(app.getHttpServer())
        .get(`/providers/${registeredProviderId}/capabilities`)
        .expect(503);

      expect(response.body.code).toBe('CRS-002');
    });
  });

  describe('GET /providers/:id/health', () => {
    it('should return 503 when adapter is unreachable', async () => {
      if (!registeredProviderId) return;

      const response = await request(app.getHttpServer())
        .get(`/providers/${registeredProviderId}/health`)
        .expect(503);

      expect(response.body.code).toBe('CRS-013');
    });
  });

  describe('DELETE /providers/:id', () => {
    it('should return 404 for non-existent provider', async () => {
      const response = await request(app.getHttpServer())
        .delete('/providers/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.code).toBe('CRS-009');
    });

    it('should deregister a provider', async () => {
      if (!registeredProviderId) return;

      await request(app.getHttpServer())
        .delete(`/providers/${registeredProviderId}`)
        .expect(204);

      // Verify it's gone
      const response = await request(app.getHttpServer())
        .get('/providers')
        .expect(200);

      const found = response.body.find(
        (p: any) => p.id === registeredProviderId,
      );
      expect(found).toBeUndefined();

      registeredProviderId = ''; // Clear so afterAll doesn't try to clean up
    });
  });
});
