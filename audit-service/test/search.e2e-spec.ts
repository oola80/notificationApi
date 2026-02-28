import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  createMockAuditEventsRepository,
  createMockMetricsService,
} from './test-utils';
import { SearchController } from '../src/search/search.controller';
import { SearchService } from '../src/search/search.service';
import { AuditEventsRepository } from '../src/events/audit-events.repository';
import { MetricsService } from '../src/metrics/metrics.service';
import { ConfigService } from '@nestjs/config';

describe('Search E2E', () => {
  let app: INestApplication<App>;
  let mockRepo: ReturnType<typeof createMockAuditEventsRepository>;
  let mockMetrics: ReturnType<typeof createMockMetricsService>;

  beforeAll(async () => {
    mockRepo = createMockAuditEventsRepository();
    mockMetrics = createMockMetricsService();

    app = await createTestApp({
      controllers: [SearchController],
      providers: [
        SearchService,
        { provide: AuditEventsRepository, useValue: mockRepo },
        { provide: MetricsService, useValue: mockMetrics },
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
    mockRepo.fullTextSearch.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    });
  });

  it('should return 400 (AUD-001) when q is missing', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/audit/search')
      .expect(400);

    expect(body.code).toBe('AUD-001');
  });

  it('should return 200 with simple query results', async () => {
    mockRepo.fullTextSearch.mockResolvedValue({
      data: [{ id: 'ev-1', eventType: 'EVENT_INGESTED' }],
      total: 1,
      page: 1,
      limit: 50,
    });

    const { body } = await request(app.getHttpServer())
      .get('/audit/search')
      .query({ q: 'order delay' })
      .expect(200);

    expect(body.data).toHaveLength(1);
    expect(body.meta.totalCount).toBe(1);
  });

  it('should handle operator query (to_tsquery)', async () => {
    await request(app.getHttpServer())
      .get('/audit/search')
      .query({ q: 'order & delay' })
      .expect(200);

    expect(mockRepo.fullTextSearch).toHaveBeenCalledWith(
      expect.objectContaining({ useRawTsquery: true }),
    );
  });

  it('should pass date range to search', async () => {
    await request(app.getHttpServer())
      .get('/audit/search')
      .query({
        q: 'test',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-15T00:00:00Z',
      })
      .expect(200);

    expect(mockRepo.fullTextSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-15T00:00:00Z',
      }),
    );
  });

  it('should return 400 (AUD-007) when results exceed max', async () => {
    mockRepo.fullTextSearch.mockResolvedValue({
      data: [],
      total: 201,
      page: 1,
      limit: 50,
    });

    const { body } = await request(app.getHttpServer())
      .get('/audit/search')
      .query({ q: 'test' })
      .expect(400);

    expect(body.code).toBe('AUD-007');
  });

  it('should return correct response shape', async () => {
    mockRepo.fullTextSearch.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 50,
    });

    const { body } = await request(app.getHttpServer())
      .get('/audit/search')
      .query({ q: 'test' })
      .expect(200);

    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('meta');
    expect(body.meta).toHaveProperty('page');
    expect(body.meta).toHaveProperty('pageSize');
    expect(body.meta).toHaveProperty('totalCount');
    expect(body.meta).toHaveProperty('totalPages');
  });
});
