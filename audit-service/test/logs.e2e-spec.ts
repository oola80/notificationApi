import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  createMockAuditEventsRepository,
  createMockMetricsService,
} from './test-utils';
import { AuditLogsController } from '../src/events/audit-logs.controller';
import { AuditLogsService } from '../src/events/audit-logs.service';
import { AuditEventsRepository } from '../src/events/audit-events.repository';
import { MetricsService } from '../src/metrics/metrics.service';
import { ConfigService } from '@nestjs/config';

describe('Audit Logs E2E', () => {
  let app: INestApplication<App>;
  let mockRepo: ReturnType<typeof createMockAuditEventsRepository>;

  beforeAll(async () => {
    mockRepo = createMockAuditEventsRepository();

    app = await createTestApp({
      controllers: [AuditLogsController],
      providers: [
        AuditLogsService,
        { provide: AuditEventsRepository, useValue: mockRepo },
        { provide: MetricsService, useValue: createMockMetricsService() },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(200) },
        },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 200 with default pagination', async () => {
    mockRepo.findWithFilters.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    });

    const { body } = await request(app.getHttpServer())
      .get('/audit/logs')
      .expect(200);

    expect(body.data).toEqual([]);
    expect(body.meta).toEqual({
      page: 1,
      pageSize: 50,
      totalCount: 0,
      totalPages: 0,
    });
  });

  it('should pass filters to repository', async () => {
    mockRepo.findWithFilters.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    });

    await request(app.getHttpServer())
      .get('/audit/logs')
      .query({
        notificationId: 'n-1',
        eventType: 'DELIVERY_SENT',
        actor: 'crs',
        page: 2,
        pageSize: 25,
      })
      .expect(200);

    expect(mockRepo.findWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: 'n-1',
        eventType: 'DELIVERY_SENT',
        actor: 'crs',
        page: 2,
        limit: 25,
      }),
    );
  });

  it('should return 400 (AUD-004) for date range exceeding 90 days', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/audit/logs')
      .query({
        from: '2026-01-01T00:00:00Z',
        to: '2026-06-01T00:00:00Z',
      })
      .expect(400);

    expect(body.code).toBe('AUD-004');
  });

  it('should support inline full-text search with q param', async () => {
    mockRepo.findWithFilters.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    });

    await request(app.getHttpServer())
      .get('/audit/logs')
      .query({ q: 'order delay' })
      .expect(200);

    expect(mockRepo.findWithFilters).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'order delay' }),
    );
  });

  it('should return correct response shape with data', async () => {
    mockRepo.findWithFilters.mockResolvedValue({
      data: [
        {
          id: 'ev-1',
          notificationId: 'n-1',
          eventType: 'EVENT_INGESTED',
          actor: 'eis',
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    const { body } = await request(app.getHttpServer())
      .get('/audit/logs')
      .expect(200);

    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe('ev-1');
    expect(body.meta.totalCount).toBe(1);
    expect(body.meta.totalPages).toBe(1);
  });

  it('should return 400 (AUD-001) for invalid pageSize', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/audit/logs')
      .query({ pageSize: 999 })
      .expect(400);

    expect(body.code).toBe('AUD-001');
  });

  it('should allow date range within 90 days', async () => {
    mockRepo.findWithFilters.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    });

    await request(app.getHttpServer())
      .get('/audit/logs')
      .query({
        from: '2026-01-01T00:00:00Z',
        to: '2026-03-01T00:00:00Z',
      })
      .expect(200);
  });
});
