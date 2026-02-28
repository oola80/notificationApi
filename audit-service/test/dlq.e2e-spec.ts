import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  createMockDlqEntriesRepository,
  createMockDlqPublisher,
  createMockMetricsService,
} from './test-utils';
import { DlqController } from '../src/dlq/dlq.controller';
import { DlqService } from '../src/dlq/dlq.service';
import { DlqEntriesRepository } from '../src/dlq/dlq-entries.repository';
import { DlqPublisher } from '../src/rabbitmq/dlq-publisher.service';
import { MetricsService } from '../src/metrics/metrics.service';
import { DlqEntryStatus } from '../src/dlq/entities/dlq-entry.entity';

describe('DLQ E2E', () => {
  let app: INestApplication<App>;
  let mockRepo: ReturnType<typeof createMockDlqEntriesRepository>;
  let mockPublisher: ReturnType<typeof createMockDlqPublisher>;

  beforeAll(async () => {
    mockRepo = createMockDlqEntriesRepository();
    mockPublisher = createMockDlqPublisher();

    app = await createTestApp({
      controllers: [DlqController],
      providers: [
        DlqService,
        { provide: DlqEntriesRepository, useValue: mockRepo },
        { provide: DlqPublisher, useValue: mockPublisher },
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

  describe('GET /audit/dlq', () => {
    it('should return 200 with empty list and statusCounts', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/audit/dlq')
        .expect(200);

      expect(body.data).toEqual([]);
      expect(body.meta.statusCounts).toEqual({
        pending: 0,
        investigated: 0,
        reprocessed: 0,
        discarded: 0,
      });
    });

    it('should pass status filter to repository', async () => {
      await request(app.getHttpServer())
        .get('/audit/dlq')
        .query({ status: 'pending' })
        .expect(200);

      expect(mockRepo.findWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' }),
      );
    });

    it('should pass originalQueue filter', async () => {
      await request(app.getHttpServer())
        .get('/audit/dlq')
        .query({ originalQueue: 'audit.events' })
        .expect(200);

      expect(mockRepo.findWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ originalQueue: 'audit.events' }),
      );
    });

    it('should pass date range filters', async () => {
      await request(app.getHttpServer())
        .get('/audit/dlq')
        .query({
          from: '2026-01-01T00:00:00Z',
          to: '2026-02-01T00:00:00Z',
        })
        .expect(200);

      expect(mockRepo.findWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '2026-01-01T00:00:00Z',
          to: '2026-02-01T00:00:00Z',
        }),
      );
    });

    it('should return 400 for invalid status filter', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/audit/dlq')
        .query({ status: 'invalid_status' })
        .expect(400);

      expect(body.code).toBe('AUD-001');
    });
  });

  describe('PATCH /audit/dlq/:id', () => {
    it('should update status from pending to investigated', async () => {
      const entry = {
        id: 'd-1',
        status: DlqEntryStatus.PENDING,
        originalQueue: 'audit.events',
      };
      mockRepo.findById
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce({ ...entry, status: DlqEntryStatus.INVESTIGATED });

      const { body } = await request(app.getHttpServer())
        .patch('/audit/dlq/d-1')
        .send({ status: 'investigated', notes: 'Investigating' })
        .expect(200);

      expect(body.data.status).toBe('investigated');
    });

    it('should update status from investigated to discarded', async () => {
      const entry = {
        id: 'd-1',
        status: DlqEntryStatus.INVESTIGATED,
      };
      mockRepo.findById
        .mockResolvedValueOnce(entry)
        .mockResolvedValueOnce({ ...entry, status: DlqEntryStatus.DISCARDED });

      const { body } = await request(app.getHttpServer())
        .patch('/audit/dlq/d-1')
        .send({ status: 'discarded', resolvedBy: 'admin@test.com' })
        .expect(200);

      expect(body.data.status).toBe('discarded');
    });

    it('should reject invalid transition (pending → reprocessed)', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'd-1',
        status: DlqEntryStatus.PENDING,
      });

      const { body } = await request(app.getHttpServer())
        .patch('/audit/dlq/d-1')
        .send({ status: 'reprocessed' })
        .expect(409);

      expect(body.code).toBe('AUD-006');
    });

    it('should return 404 when entry not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .patch('/audit/dlq/nonexistent')
        .send({ status: 'investigated' })
        .expect(404);

      expect(body.code).toBe('AUD-003');
    });

    it('should return 400 for invalid status value', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/audit/dlq/d-1')
        .send({ status: 'bad_status' })
        .expect(400);

      expect(body.code).toBe('AUD-001');
    });
  });

  describe('POST /audit/dlq/:id/reprocess', () => {
    it('should reprocess investigated entry', async () => {
      const entry = {
        id: 'd-1',
        status: DlqEntryStatus.INVESTIGATED,
        originalExchange: 'xch.events.normalized',
        originalRoutingKey: 'event.normalized',
        payload: { test: 'data' },
      };
      mockRepo.findById.mockResolvedValue(entry);

      const { body } = await request(app.getHttpServer())
        .post('/audit/dlq/d-1/reprocess')
        .send({ resolvedBy: 'admin@test.com' })
        .expect(201);

      expect(body.data.status).toBe('reprocessed');
      expect(body.data.reprocessedTo.exchange).toBe('xch.events.normalized');
      expect(mockPublisher.republish).toHaveBeenCalledWith(
        'xch.events.normalized',
        'event.normalized',
        { test: 'data' },
      );
    });

    it('should reject reprocess of non-investigated entry', async () => {
      mockRepo.findById.mockResolvedValue({
        id: 'd-1',
        status: DlqEntryStatus.PENDING,
      });

      const { body } = await request(app.getHttpServer())
        .post('/audit/dlq/d-1/reprocess')
        .send({})
        .expect(409);

      expect(body.code).toBe('AUD-006');
    });

    it('should return 404 when entry not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const { body } = await request(app.getHttpServer())
        .post('/audit/dlq/nonexistent/reprocess')
        .send({})
        .expect(404);

      expect(body.code).toBe('AUD-003');
    });
  });
});
