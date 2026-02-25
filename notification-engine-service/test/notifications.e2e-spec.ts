import { INestApplication } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { createTestApp } from './test-utils.js';

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let module: TestingModule;
  let dataSource: DataSource;
  let seededNotificationId: string | null = null;

  beforeAll(async () => {
    const result = await createTestApp();
    app = result.app;
    module = result.module;
    dataSource = module.get(DataSource);

    // Seed a test notification directly via DB
    try {
      const insertResult = await dataSource.query(
        `INSERT INTO notification_engine_service.notifications
         (notification_id, event_id, rule_id, template_id, channel, status, priority, recipient_email, event_type)
         VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000',
                 'tpl-e2e-seed', 'email', 'PENDING', 'normal', 'e2e-seed@example.com', 'e2e.seed.event')
         RETURNING notification_id`,
      );
      seededNotificationId = insertResult[0]?.notification_id ?? null;

      if (seededNotificationId) {
        // Seed a status log entry
        await dataSource.query(
          `INSERT INTO notification_engine_service.notification_status_log
           (notification_id, from_status, to_status, channel)
           VALUES ($1, NULL, 'PENDING', 'email')`,
          [seededNotificationId],
        );
      }
    } catch {
      // Seed may fail if tables don't exist — tests will handle that
    }
  });

  afterAll(async () => {
    if (seededNotificationId) {
      try {
        await dataSource.query(
          `DELETE FROM notification_engine_service.notification_status_log WHERE notification_id = $1`,
          [seededNotificationId],
        );
        await dataSource.query(
          `DELETE FROM notification_engine_service.notification_recipients WHERE notification_id = $1`,
          [seededNotificationId],
        );
        await dataSource.query(
          `DELETE FROM notification_engine_service.notifications WHERE notification_id = $1`,
          [seededNotificationId],
        );
      } catch {
        // ignore
      }
    }
    await app.close();
  });

  describe('GET /notifications', () => {
    it('should return paginated notifications', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('limit');
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications?status=PENDING')
        .expect(200);

      expect(res.body).toHaveProperty('data');
      if (res.body.data.length > 0) {
        expect(res.body.data[0].status).toBe('PENDING');
      }
    });
  });

  describe('GET /notifications/:id', () => {
    it('should return notification with timeline and recipients', async () => {
      if (!seededNotificationId) return;

      const res = await request(app.getHttpServer())
        .get(`/notifications/${seededNotificationId}`)
        .expect(200);

      expect(res.body).toHaveProperty('notification');
      expect(res.body).toHaveProperty('timeline');
      expect(res.body).toHaveProperty('recipients');
      expect(res.body.notification.notificationId).toBe(seededNotificationId);
    });

    it('should return 404 for non-existent notification', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications/00000000-0000-0000-0000-999999999999')
        .expect(404);

      expect(res.body.code).toBe('NES-003');
    });
  });

  describe('GET /notifications/:id/timeline', () => {
    it('should return status log entries', async () => {
      if (!seededNotificationId) return;

      const res = await request(app.getHttpServer())
        .get(`/notifications/${seededNotificationId}/timeline`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('toStatus');
        expect(res.body[0].toStatus).toBe('PENDING');
      }
    });
  });
});
