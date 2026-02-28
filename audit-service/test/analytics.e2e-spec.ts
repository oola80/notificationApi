import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  createMockNotificationAnalyticsRepository,
  createMockMetricsService,
} from './test-utils';
import { AnalyticsController } from '../src/analytics/analytics.controller';
import { AnalyticsService } from '../src/analytics/analytics.service';
import { NotificationAnalyticsRepository } from '../src/analytics/notification-analytics.repository';
import { MetricsService } from '../src/metrics/metrics.service';

describe('Analytics E2E', () => {
  let app: INestApplication<App>;
  let mockRepo: ReturnType<typeof createMockNotificationAnalyticsRepository>;

  beforeAll(async () => {
    mockRepo = createMockNotificationAnalyticsRepository();

    app = await createTestApp({
      controllers: [AnalyticsController],
      providers: [
        AnalyticsService,
        {
          provide: NotificationAnalyticsRepository,
          useValue: mockRepo,
        },
        { provide: MetricsService, useValue: createMockMetricsService() },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /audit/analytics', () => {
    it('should return 200 with analytics data and meta', async () => {
      mockRepo.findWithFilters.mockResolvedValue({
        data: [
          {
            id: 'a-1',
            period: 'daily',
            channel: 'email',
            totalSent: 100,
            totalDelivered: 90,
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      });

      const { body } = await request(app.getHttpServer())
        .get('/audit/analytics')
        .query({
          period: 'daily',
          from: '2026-02-01T00:00:00Z',
          to: '2026-02-28T00:00:00Z',
        })
        .expect(200);

      expect(body.data).toHaveLength(1);
      expect(body.meta.period).toBe('daily');
      expect(body.meta.totalRecords).toBe(1);
    });

    it('should default period to daily', async () => {
      mockRepo.findWithFilters.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 50,
      });

      const { body } = await request(app.getHttpServer())
        .get('/audit/analytics')
        .query({
          from: '2026-02-01T00:00:00Z',
          to: '2026-02-28T00:00:00Z',
        })
        .expect(200);

      expect(body.meta.period).toBe('daily');
    });

    it('should pass channel and eventType filters', async () => {
      mockRepo.findWithFilters.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 50,
      });

      await request(app.getHttpServer())
        .get('/audit/analytics')
        .query({
          period: 'hourly',
          from: '2026-02-28T00:00:00Z',
          to: '2026-02-28T23:59:59Z',
          channel: 'email',
          eventType: 'order.delay',
        })
        .expect(200);

      expect(mockRepo.findWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          period: 'hourly',
          channel: 'email',
          eventType: 'order.delay',
        }),
      );
    });

    it('should return 400 when from is missing', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/audit/analytics')
        .query({ to: '2026-02-28T00:00:00Z' })
        .expect(400);

      expect(body.code).toBe('AUD-001');
    });

    it('should return 400 when to is missing', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/audit/analytics')
        .query({ from: '2026-02-01T00:00:00Z' })
        .expect(400);

      expect(body.code).toBe('AUD-001');
    });

    it('should return 400 for invalid period', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/audit/analytics')
        .query({
          period: 'weekly',
          from: '2026-02-01T00:00:00Z',
          to: '2026-02-28T00:00:00Z',
        })
        .expect(400);

      expect(body.code).toBe('AUD-001');
    });
  });

  describe('GET /audit/analytics/summary', () => {
    it('should return summary with today, last7Days, and channelBreakdown', async () => {
      mockRepo.findForSummary.mockImplementation(
        (period: string) => {
          if (period === 'hourly') {
            return [
              {
                channel: '_all',
                totalSent: 100,
                totalDelivered: 90,
                totalFailed: 5,
                avgLatencyMs: null,
              },
              {
                channel: 'email',
                totalSent: 80,
                totalDelivered: 75,
                totalFailed: 3,
                avgLatencyMs: null,
              },
            ];
          }
          if (period === 'daily') {
            return [
              {
                channel: '_all',
                totalSent: 700,
                totalDelivered: 650,
                totalFailed: 30,
                avgLatencyMs: 200,
              },
            ];
          }
          return [];
        },
      );

      const { body } = await request(app.getHttpServer())
        .get('/audit/analytics/summary')
        .expect(200);

      expect(body.today.totalSent).toBe(100);
      expect(body.today.totalDelivered).toBe(90);
      expect(body.today.deliveryRate).toBe(90);
      expect(body.today.totalFailed).toBe(5);
      expect(body.today.failureRate).toBe(5);

      expect(body.last7Days.totalSent).toBe(700);
      expect(body.last7Days.totalDelivered).toBe(650);
      expect(body.last7Days.avgLatencyMs).toBe(200);

      expect(body.channelBreakdown).toHaveLength(1);
      expect(body.channelBreakdown[0].channel).toBe('email');
    });

    it('should handle empty data gracefully', async () => {
      mockRepo.findForSummary.mockResolvedValue([]);

      const { body } = await request(app.getHttpServer())
        .get('/audit/analytics/summary')
        .expect(200);

      expect(body.today.totalSent).toBe(0);
      expect(body.today.deliveryRate).toBe(0);
      expect(body.last7Days.totalSent).toBe(0);
      expect(body.channelBreakdown).toHaveLength(0);
    });
  });
});
