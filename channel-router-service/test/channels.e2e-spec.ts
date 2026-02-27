import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';

describe('Channels (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('GET /channels', () => {
    it('should return a list of channels', async () => {
      const response = await request(app.getHttpServer())
        .get('/channels')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);

      if (response.body.length > 0) {
        const channel = response.body[0];
        expect(channel).toHaveProperty('id');
        expect(channel).toHaveProperty('name');
        expect(channel).toHaveProperty('type');
        expect(channel).toHaveProperty('isActive');
        expect(channel).toHaveProperty('routingMode');
        expect(channel).toHaveProperty('providers');
        expect(Array.isArray(channel.providers)).toBe(true);
      }
    });
  });

  describe('PUT /channels/:id/config', () => {
    it('should return 400 for invalid UUID', async () => {
      const response = await request(app.getHttpServer())
        .put('/channels/not-a-uuid/config')
        .send({ routingMode: 'weighted' })
        .expect(400);

      expect(response.body).toHaveProperty('code');
    });

    it('should return 400 for invalid routing mode', async () => {
      const channelsRes = await request(app.getHttpServer())
        .get('/channels')
        .expect(200);

      if (channelsRes.body.length > 0) {
        const channelId = channelsRes.body[0].id;

        const response = await request(app.getHttpServer())
          .put(`/channels/${channelId}/config`)
          .send({ routingMode: 'invalid-mode' })
          .expect(400);

        expect(response.body).toHaveProperty('code');
      }
    });

    it('should update channel config with valid data', async () => {
      const channelsRes = await request(app.getHttpServer())
        .get('/channels')
        .expect(200);

      if (channelsRes.body.length > 0) {
        const channel = channelsRes.body[0];

        const response = await request(app.getHttpServer())
          .put(`/channels/${channel.id}/config`)
          .send({ routingMode: 'weighted' })
          .expect(200);

        expect(response.body.routingMode).toBe('weighted');

        // Restore original
        await request(app.getHttpServer())
          .put(`/channels/${channel.id}/config`)
          .send({ routingMode: channel.routingMode });
      }
    });

    it('should return 404 for non-existent channel', async () => {
      const response = await request(app.getHttpServer())
        .put('/channels/00000000-0000-0000-0000-000000000000/config')
        .send({ routingMode: 'primary' })
        .expect(404);

      expect(response.body.code).toBe('CRS-008');
    });
  });
});
