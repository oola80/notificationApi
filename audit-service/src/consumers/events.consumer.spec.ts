import { EventsConsumer } from './events.consumer';
import { BatchBufferService } from './batch-buffer.service';
import { QUEUE_AUDIT_EVENTS } from '../rabbitmq/rabbitmq.constants';

describe('EventsConsumer', () => {
  let consumer: EventsConsumer;
  let mockBatchBuffer: jest.Mocked<BatchBufferService>;
  let mockAuditEventsRepo: any;
  let mockMetricsService: any;

  beforeEach(() => {
    mockBatchBuffer = {
      registerFlushHandler: jest.fn(),
      add: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockAuditEventsRepo = {
      insertMany: jest.fn().mockResolvedValue(undefined),
    };

    mockMetricsService = {
      incrementEventsIngested: jest.fn(),
      incrementDeserializationErrors: jest.fn(),
    };

    consumer = new EventsConsumer(
      mockBatchBuffer,
      mockAuditEventsRepo,
      mockMetricsService,
    );
  });

  describe('onModuleInit', () => {
    it('should register flush handler for audit.events queue', () => {
      consumer.onModuleInit();
      expect(mockBatchBuffer.registerFlushHandler).toHaveBeenCalledWith(
        QUEUE_AUDIT_EVENTS,
        expect.any(Function),
      );
    });

    it('flush handler should call auditEventsRepo.insertMany', async () => {
      consumer.onModuleInit();
      const handler =
        mockBatchBuffer.registerFlushHandler.mock.calls[0][1];
      const records = [{ eventType: 'TEST' }];
      await handler(records);
      expect(mockAuditEventsRepo.insertMany).toHaveBeenCalledWith(records);
    });
  });

  describe('handle', () => {
    beforeEach(() => {
      consumer.onModuleInit();
    });

    it('should process a normalized event message', async () => {
      const message = {
        eventId: 'evt-123',
        sourceId: 'source-1',
        eventType: 'order.created',
        priority: 'normal',
        correlationId: 'corr-1',
        cycleId: 'cycle-1',
        normalizedPayload: { order: { id: 1 } },
      };

      await consumer.handle(message, {});

      expect(mockBatchBuffer.add).toHaveBeenCalledWith(
        QUEUE_AUDIT_EVENTS,
        expect.objectContaining({
          notificationId: 'evt-123',
          correlationId: 'corr-1',
          cycleId: 'cycle-1',
          eventType: 'EVENT_NORMALIZED',
          actor: 'event-ingestion-service',
        }),
      );
      expect(mockMetricsService.incrementEventsIngested).toHaveBeenCalledWith(
        'EVENT_NORMALIZED',
        'event-ingestion-service',
      );
    });

    it('should map EVENT_VALIDATION_FAILED when validationErrors present', async () => {
      const message = {
        eventId: 'evt-456',
        validationErrors: ['field required'],
      };

      await consumer.handle(message, {});

      expect(mockBatchBuffer.add).toHaveBeenCalledWith(
        QUEUE_AUDIT_EVENTS,
        expect.objectContaining({
          eventType: 'EVENT_VALIDATION_FAILED',
        }),
      );
    });

    it('should map EVENT_DUPLICATE_DETECTED when isDuplicate present', async () => {
      const message = {
        eventId: 'evt-789',
        isDuplicate: true,
      };

      await consumer.handle(message, {});

      expect(mockBatchBuffer.add).toHaveBeenCalledWith(
        QUEUE_AUDIT_EVENTS,
        expect.objectContaining({
          eventType: 'EVENT_DUPLICATE_DETECTED',
        }),
      );
    });

    it('should map EVENT_INGESTED for bare messages', async () => {
      const message = { eventId: 'evt-bare' };

      await consumer.handle(message, {});

      expect(mockBatchBuffer.add).toHaveBeenCalledWith(
        QUEUE_AUDIT_EVENTS,
        expect.objectContaining({
          eventType: 'EVENT_INGESTED',
        }),
      );
    });

    it('should use explicit auditEventType when provided', async () => {
      const message = {
        eventId: 'evt-explicit',
        auditEventType: 'ingested',
      };

      await consumer.handle(message, {});

      expect(mockBatchBuffer.add).toHaveBeenCalledWith(
        QUEUE_AUDIT_EVENTS,
        expect.objectContaining({
          eventType: 'EVENT_INGESTED',
        }),
      );
    });

    it('should ACK and increment metric on null message', async () => {
      const result = await consumer.handle(null as any, {});

      expect(result).toBeUndefined(); // ACK
      expect(
        mockMetricsService.incrementDeserializationErrors,
      ).toHaveBeenCalledWith(QUEUE_AUDIT_EVENTS);
      expect(mockBatchBuffer.add).not.toHaveBeenCalled();
    });

    it('should ACK and increment metric on non-object message', async () => {
      const result = await consumer.handle('bad string' as any, {});

      expect(result).toBeUndefined();
      expect(
        mockMetricsService.incrementDeserializationErrors,
      ).toHaveBeenCalledWith(QUEUE_AUDIT_EVENTS);
    });

    it('should ACK and increment metric on processing error', async () => {
      mockBatchBuffer.add.mockRejectedValue(new Error('unexpected'));

      const result = await consumer.handle({ valid: true } as any, {});

      expect(result).toBeUndefined();
      expect(
        mockMetricsService.incrementDeserializationErrors,
      ).toHaveBeenCalledWith(QUEUE_AUDIT_EVENTS);
    });

    it('should extract metadata from message fields', async () => {
      const message = {
        eventId: 'e1',
        sourceId: 'src',
        eventType: 'order.shipped',
        priority: 'critical',
        normalizedPayload: { data: true },
      };

      await consumer.handle(message, {});

      const addedRecord = mockBatchBuffer.add.mock.calls[0][1];
      expect(addedRecord.metadata).toEqual({
        sourceId: 'src',
        eventType: 'order.shipped',
        priority: 'critical',
      });
      expect(addedRecord.payloadSnapshot).toEqual({ data: true });
    });
  });
});
