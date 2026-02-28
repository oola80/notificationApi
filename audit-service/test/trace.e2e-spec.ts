import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  createTestApp,
  createMockAuditEventsRepository,
  createMockDeliveryReceiptsRepository,
  createMockMetricsService,
} from './test-utils';
import { TraceController } from '../src/trace/trace.controller';
import { TraceService } from '../src/trace/trace.service';
import { AuditEventsRepository } from '../src/events/audit-events.repository';
import { DeliveryReceiptsRepository } from '../src/receipts/delivery-receipts.repository';
import { MetricsService } from '../src/metrics/metrics.service';

describe('Trace E2E', () => {
  let app: INestApplication<App>;
  let mockEventsRepo: ReturnType<typeof createMockAuditEventsRepository>;
  let mockReceiptsRepo: ReturnType<typeof createMockDeliveryReceiptsRepository>;

  beforeAll(async () => {
    mockEventsRepo = createMockAuditEventsRepository();
    mockReceiptsRepo = createMockDeliveryReceiptsRepository();

    app = await createTestApp({
      controllers: [TraceController],
      providers: [
        TraceService,
        { provide: AuditEventsRepository, useValue: mockEventsRepo },
        {
          provide: DeliveryReceiptsRepository,
          useValue: mockReceiptsRepo,
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
    mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue([]);
    mockEventsRepo.findDistinctNotificationIds.mockResolvedValue([]);
    mockReceiptsRepo.findByNotificationIdOrdered.mockResolvedValue([]);
  });

  describe('GET /audit/trace/:notificationId', () => {
    it('should return notification trace', async () => {
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue([
        {
          id: 'ev-1',
          notificationId: 'n-1',
          correlationId: 'c-1',
          cycleId: 'cy-1',
          eventType: 'EVENT_INGESTED',
          actor: 'event-ingestion-service',
          metadata: { channel: 'email' },
          payloadSnapshot: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
      ]);

      const { body } = await request(app.getHttpServer())
        .get('/audit/trace/n-1')
        .expect(200);

      expect(body.summary.notificationId).toBe('n-1');
      expect(body.summary.correlationId).toBe('c-1');
      expect(body.summary.cycleId).toBe('cy-1');
      expect(body.summary.channel).toBe('email');
      expect(body.timeline).toHaveLength(1);
      expect(body.timeline[0].eventType).toBe('EVENT_INGESTED');
    });

    it('should return 404 (AUD-008) when not found', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/audit/trace/nonexistent')
        .expect(404);

      expect(body.code).toBe('AUD-008');
    });

    it('should merge events and receipts in timeline order', async () => {
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue([
        {
          id: 'ev-1',
          notificationId: 'n-1',
          correlationId: 'c-1',
          cycleId: 'cy-1',
          eventType: 'EVENT_INGESTED',
          actor: 'eis',
          metadata: {},
          payloadSnapshot: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
      ]);
      mockReceiptsRepo.findByNotificationIdOrdered.mockResolvedValue([
        {
          id: 'rc-1',
          notificationId: 'n-1',
          correlationId: 'c-1',
          cycleId: 'cy-1',
          channel: 'email',
          provider: 'mailgun',
          status: 'delivered',
          providerMessageId: 'pm-1',
          rawResponse: null,
          receivedAt: new Date('2026-01-01T10:05:00Z'),
        },
      ]);

      const { body } = await request(app.getHttpServer())
        .get('/audit/trace/n-1')
        .expect(200);

      expect(body.timeline).toHaveLength(2);
      expect(body.timeline[0].source).toBe('audit_event');
      expect(body.timeline[1].source).toBe('delivery_receipt');
      expect(body.summary.eventCount).toBe(1);
      expect(body.summary.receiptCount).toBe(1);
    });
  });

  describe('GET /audit/trace/correlation/:correlationId', () => {
    it('should return grouped traces', async () => {
      mockEventsRepo.findDistinctNotificationIds.mockResolvedValue([
        'n-1',
        'n-2',
      ]);
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue([
        {
          id: 'ev-1',
          notificationId: 'n-1',
          correlationId: 'c-123',
          cycleId: null,
          eventType: 'EVENT_INGESTED',
          actor: 'eis',
          metadata: {},
          payloadSnapshot: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
      ]);

      const { body } = await request(app.getHttpServer())
        .get('/audit/trace/correlation/c-123')
        .expect(200);

      expect(body.correlationId).toBe('c-123');
      expect(body.notifications).toHaveLength(2);
    });

    it('should return 404 (AUD-008) when not found', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/audit/trace/correlation/nonexistent')
        .expect(404);

      expect(body.code).toBe('AUD-008');
    });
  });

  describe('GET /audit/trace/cycle/:cycleId', () => {
    it('should return grouped traces', async () => {
      mockEventsRepo.findDistinctNotificationIds.mockResolvedValue(['n-1']);
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue([
        {
          id: 'ev-1',
          notificationId: 'n-1',
          correlationId: null,
          cycleId: 'cy-456',
          eventType: 'EVENT_INGESTED',
          actor: 'eis',
          metadata: {},
          payloadSnapshot: null,
          createdAt: new Date('2026-01-01T10:00:00Z'),
        },
      ]);

      const { body } = await request(app.getHttpServer())
        .get('/audit/trace/cycle/cy-456')
        .expect(200);

      expect(body.cycleId).toBe('cy-456');
      expect(body.notifications).toHaveLength(1);
    });

    it('should return 404 (AUD-008) when not found', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/audit/trace/cycle/nonexistent')
        .expect(404);

      expect(body.code).toBe('AUD-008');
    });
  });
});
