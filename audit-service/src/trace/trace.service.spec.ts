import { TraceService } from './trace.service';
import { AuditEventsRepository } from '../events/audit-events.repository';
import { DeliveryReceiptsRepository } from '../receipts/delivery-receipts.repository';
import { MetricsService } from '../metrics/metrics.service';
import { AuditEvent } from '../events/entities/audit-event.entity';
import { DeliveryReceipt } from '../receipts/entities/delivery-receipt.entity';
import { HttpException } from '@nestjs/common';

function createEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  const event = new AuditEvent();
  event.id = overrides.id ?? 'ev-1';
  event.notificationId = overrides.notificationId ?? 'n-1';
  event.correlationId = overrides.correlationId ?? 'c-1';
  event.cycleId = overrides.cycleId ?? 'cy-1';
  event.eventType = overrides.eventType ?? 'EVENT_INGESTED';
  event.actor = overrides.actor ?? 'event-ingestion-service';
  event.metadata = overrides.metadata ?? {};
  event.payloadSnapshot = overrides.payloadSnapshot ?? null;
  event.createdAt = overrides.createdAt ?? new Date('2026-01-01T10:00:00Z');
  return event;
}

function createReceipt(
  overrides: Partial<DeliveryReceipt> = {},
): DeliveryReceipt {
  const receipt = new DeliveryReceipt();
  receipt.id = overrides.id ?? 'rc-1';
  receipt.notificationId = overrides.notificationId ?? 'n-1';
  receipt.correlationId = overrides.correlationId ?? 'c-1';
  receipt.cycleId = overrides.cycleId ?? 'cy-1';
  receipt.channel = overrides.channel ?? 'email';
  receipt.provider = overrides.provider ?? 'mailgun';
  receipt.status = overrides.status ?? 'delivered';
  receipt.providerMessageId = overrides.providerMessageId ?? 'pm-1';
  receipt.rawResponse = overrides.rawResponse ?? null;
  receipt.receivedAt = overrides.receivedAt ?? new Date('2026-01-01T10:05:00Z');
  return receipt;
}

describe('TraceService', () => {
  let service: TraceService;
  let mockEventsRepo: any;
  let mockReceiptsRepo: any;
  let mockMetrics: any;

  beforeEach(() => {
    mockEventsRepo = {
      findByNotificationIdOrdered: jest.fn().mockResolvedValue([]),
      findDistinctNotificationIds: jest.fn().mockResolvedValue([]),
    };

    mockReceiptsRepo = {
      findByNotificationIdOrdered: jest.fn().mockResolvedValue([]),
    };

    mockMetrics = {
      observeTraceDuration: jest.fn(),
    };

    service = new TraceService(
      mockEventsRepo as unknown as AuditEventsRepository,
      mockReceiptsRepo as unknown as DeliveryReceiptsRepository,
      mockMetrics as unknown as MetricsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('traceByNotificationId', () => {
    it('should return trace with events and receipts merged', async () => {
      const events = [
        createEvent({
          id: 'ev-1',
          eventType: 'EVENT_INGESTED',
          createdAt: new Date('2026-01-01T10:00:00Z'),
        }),
        createEvent({
          id: 'ev-2',
          eventType: 'DELIVERY_DISPATCHED',
          createdAt: new Date('2026-01-01T10:01:00Z'),
        }),
      ];
      const receipts = [
        createReceipt({
          id: 'rc-1',
          status: 'delivered',
          receivedAt: new Date('2026-01-01T10:02:00Z'),
        }),
      ];

      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue(events);
      mockReceiptsRepo.findByNotificationIdOrdered.mockResolvedValue(receipts);

      const result = await service.traceByNotificationId('n-1');

      expect(result.timeline).toHaveLength(3);
      expect(result.timeline[0].source).toBe('audit_event');
      expect(result.timeline[0].eventType).toBe('EVENT_INGESTED');
      expect(result.timeline[1].source).toBe('audit_event');
      expect(result.timeline[2].source).toBe('delivery_receipt');
      expect(result.timeline[2].eventType).toBe('RECEIPT_DELIVERED');
    });

    it('should return trace with events only', async () => {
      const events = [createEvent()];
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue(events);

      const result = await service.traceByNotificationId('n-1');

      expect(result.timeline).toHaveLength(1);
      expect(result.summary.eventCount).toBe(1);
      expect(result.summary.receiptCount).toBe(0);
    });

    it('should return trace with receipts only', async () => {
      const receipts = [createReceipt()];
      mockReceiptsRepo.findByNotificationIdOrdered.mockResolvedValue(receipts);

      const result = await service.traceByNotificationId('n-1');

      expect(result.timeline).toHaveLength(1);
      expect(result.summary.eventCount).toBe(0);
      expect(result.summary.receiptCount).toBe(1);
    });

    it('should throw AUD-008 when no events or receipts found', async () => {
      await expect(
        service.traceByNotificationId('nonexistent'),
      ).rejects.toThrow(HttpException);

      try {
        await service.traceByNotificationId('nonexistent');
      } catch (e: any) {
        expect(e.getResponse().code).toBe('AUD-008');
      }
    });

    it('should build summary with correlationId and cycleId from earliest event', async () => {
      const events = [
        createEvent({
          correlationId: 'c-abc',
          cycleId: 'cy-xyz',
        }),
      ];
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue(events);

      const result = await service.traceByNotificationId('n-1');

      expect(result.summary.correlationId).toBe('c-abc');
      expect(result.summary.cycleId).toBe('cy-xyz');
      expect(result.summary.notificationId).toBe('n-1');
    });

    it('should extract channel from event metadata', async () => {
      const events = [
        createEvent({ metadata: { channel: 'email' } }),
      ];
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue(events);

      const result = await service.traceByNotificationId('n-1');

      expect(result.summary.channel).toBe('email');
    });

    it('should extract channel from receipt when no event metadata', async () => {
      const events = [createEvent({ metadata: {} })];
      const receipts = [createReceipt({ channel: 'sms' })];
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue(events);
      mockReceiptsRepo.findByNotificationIdOrdered.mockResolvedValue(receipts);

      const result = await service.traceByNotificationId('n-1');

      expect(result.summary.channel).toBe('sms');
    });

    it('should extract finalStatus from last timeline entry', async () => {
      const events = [
        createEvent({
          eventType: 'EVENT_INGESTED',
          createdAt: new Date('2026-01-01T10:00:00Z'),
        }),
      ];
      const receipts = [
        createReceipt({
          status: 'delivered',
          receivedAt: new Date('2026-01-01T10:05:00Z'),
        }),
      ];
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue(events);
      mockReceiptsRepo.findByNotificationIdOrdered.mockResolvedValue(receipts);

      const result = await service.traceByNotificationId('n-1');

      expect(result.summary.finalStatus).toBe('RECEIPT_DELIVERED');
    });

    it('should sort timeline by timestamp', async () => {
      const events = [
        createEvent({
          id: 'ev-1',
          eventType: 'EVENT_INGESTED',
          createdAt: new Date('2026-01-01T10:03:00Z'),
        }),
      ];
      const receipts = [
        createReceipt({
          id: 'rc-1',
          receivedAt: new Date('2026-01-01T10:01:00Z'),
        }),
      ];
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue(events);
      mockReceiptsRepo.findByNotificationIdOrdered.mockResolvedValue(receipts);

      const result = await service.traceByNotificationId('n-1');

      expect(result.timeline[0].source).toBe('delivery_receipt');
      expect(result.timeline[1].source).toBe('audit_event');
    });

    it('should observe trace duration metric', async () => {
      const events = [createEvent()];
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue(events);

      await service.traceByNotificationId('n-1');

      expect(mockMetrics.observeTraceDuration).toHaveBeenCalledWith(
        expect.any(Number),
      );
    });

    it('should return null channel when not available', async () => {
      const events = [createEvent({ metadata: {} })];
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue(events);

      const result = await service.traceByNotificationId('n-1');

      expect(result.summary.channel).toBeNull();
    });
  });

  describe('traceByCorrelationId', () => {
    it('should group traces by notification ID', async () => {
      mockEventsRepo.findDistinctNotificationIds.mockResolvedValue([
        'n-1',
        'n-2',
      ]);
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue([
        createEvent(),
      ]);

      const result = await service.traceByCorrelationId('c-123');

      expect(result.correlationId).toBe('c-123');
      expect(result.notifications).toHaveLength(2);
      expect(mockEventsRepo.findDistinctNotificationIds).toHaveBeenCalledWith(
        'correlationId',
        'c-123',
      );
    });

    it('should throw AUD-008 when no notifications found', async () => {
      mockEventsRepo.findDistinctNotificationIds.mockResolvedValue([]);

      try {
        await service.traceByCorrelationId('nonexistent');
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.getResponse().code).toBe('AUD-008');
      }
    });

    it('should observe trace duration metric', async () => {
      mockEventsRepo.findDistinctNotificationIds.mockResolvedValue(['n-1']);
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue([
        createEvent(),
      ]);

      await service.traceByCorrelationId('c-123');

      expect(mockMetrics.observeTraceDuration).toHaveBeenCalled();
    });
  });

  describe('traceByCycleId', () => {
    it('should group traces by notification ID', async () => {
      mockEventsRepo.findDistinctNotificationIds.mockResolvedValue([
        'n-1',
        'n-2',
        'n-3',
      ]);
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue([
        createEvent(),
      ]);

      const result = await service.traceByCycleId('cy-456');

      expect(result.cycleId).toBe('cy-456');
      expect(result.notifications).toHaveLength(3);
      expect(mockEventsRepo.findDistinctNotificationIds).toHaveBeenCalledWith(
        'cycleId',
        'cy-456',
      );
    });

    it('should throw AUD-008 when no notifications found', async () => {
      mockEventsRepo.findDistinctNotificationIds.mockResolvedValue([]);

      try {
        await service.traceByCycleId('nonexistent');
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.getResponse().code).toBe('AUD-008');
      }
    });

    it('should observe trace duration metric', async () => {
      mockEventsRepo.findDistinctNotificationIds.mockResolvedValue(['n-1']);
      mockEventsRepo.findByNotificationIdOrdered.mockResolvedValue([
        createEvent(),
      ]);

      await service.traceByCycleId('cy-456');

      expect(mockMetrics.observeTraceDuration).toHaveBeenCalled();
    });
  });
});
