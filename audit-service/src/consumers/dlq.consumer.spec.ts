import { DlqConsumer } from './dlq.consumer';
import { BatchBufferService } from './batch-buffer.service';
import { DlqEntryStatus } from '../dlq/entities/dlq-entry.entity';
import { QUEUE_AUDIT_DLQ } from '../rabbitmq/rabbitmq.constants';

describe('DlqConsumer', () => {
  let consumer: DlqConsumer;
  let mockBatchBuffer: jest.Mocked<BatchBufferService>;
  let mockAuditEventsRepo: any;
  let mockDlqEntriesRepo: any;
  let mockMetricsService: any;

  beforeEach(() => {
    mockBatchBuffer = {
      registerFlushHandler: jest.fn(),
      add: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockAuditEventsRepo = {
      insertMany: jest.fn().mockResolvedValue(undefined),
    };

    mockDlqEntriesRepo = {
      insertMany: jest.fn().mockResolvedValue(undefined),
    };

    mockMetricsService = {
      incrementDlqEntries: jest.fn(),
      incrementEventsIngested: jest.fn(),
      incrementDeserializationErrors: jest.fn(),
    };

    consumer = new DlqConsumer(
      mockBatchBuffer,
      mockAuditEventsRepo,
      mockDlqEntriesRepo,
      mockMetricsService,
    );
  });

  describe('onModuleInit', () => {
    it('should register flush handler for audit.dlq queue', () => {
      consumer.onModuleInit();
      expect(mockBatchBuffer.registerFlushHandler).toHaveBeenCalledWith(
        QUEUE_AUDIT_DLQ,
        expect.any(Function),
      );
    });

    it('flush handler should insert both audit events and dlq entries', async () => {
      consumer.onModuleInit();
      const handler = mockBatchBuffer.registerFlushHandler.mock.calls[0][1];

      const records = [
        {
          auditEvent: { eventType: 'DLQ_CAPTURED' },
          dlqEntry: { originalQueue: 'q.test' },
        },
      ];

      await handler(records);

      expect(mockAuditEventsRepo.insertMany).toHaveBeenCalledWith([
        { eventType: 'DLQ_CAPTURED' },
      ]);
      expect(mockDlqEntriesRepo.insertMany).toHaveBeenCalledWith([
        { originalQueue: 'q.test' },
      ]);
    });
  });

  describe('handle', () => {
    beforeEach(() => {
      consumer.onModuleInit();
    });

    it('should process a DLQ message with x-death headers', async () => {
      const message = {
        notificationId: 'n1',
        correlationId: 'c1',
        cycleId: 'cy1',
        payload: { data: true },
      };
      const amqpMsg = {
        properties: {
          headers: {
            'x-death': [
              {
                queue: 'q.deliver.email.critical',
                exchange: 'xch.notifications.deliver',
                'routing-keys': ['notification.deliver.critical.email'],
                reason: 'rejected',
                count: 3,
              },
            ],
          },
        },
      };

      await consumer.handle(message, amqpMsg);

      expect(mockBatchBuffer.add).toHaveBeenCalledWith(
        QUEUE_AUDIT_DLQ,
        expect.objectContaining({
          dlqEntry: expect.objectContaining({
            originalQueue: 'q.deliver.email.critical',
            originalExchange: 'xch.notifications.deliver',
            originalRoutingKey: 'notification.deliver.critical.email',
            rejectionReason: 'rejected',
            retryCount: 3,
            status: DlqEntryStatus.PENDING,
            payload: message,
          }),
          auditEvent: expect.objectContaining({
            eventType: 'DLQ_CAPTURED',
            actor: 'audit-service',
            notificationId: 'n1',
          }),
        }),
      );
    });

    it('should extract x-death headers correctly', async () => {
      const amqpMsg = {
        properties: {
          headers: {
            'x-death': [
              {
                queue: 'q.status.updates',
                exchange: 'xch.notifications.status',
                'routing-keys': ['notification.status.sent'],
                reason: 'expired',
                count: 1,
              },
            ],
          },
        },
      };

      await consumer.handle({ notificationId: 'n1' }, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.dlqEntry.originalQueue).toBe('q.status.updates');
      expect(record.dlqEntry.originalExchange).toBe('xch.notifications.status');
      expect(record.dlqEntry.originalRoutingKey).toBe('notification.status.sent');
      expect(record.dlqEntry.rejectionReason).toBe('expired');
      expect(record.dlqEntry.retryCount).toBe(1);
    });

    it('should handle missing x-death headers with fallback', async () => {
      const amqpMsg = {
        properties: {
          headers: {
            'x-first-death-queue': 'q.test',
            'x-first-death-exchange': 'xch.test',
          },
        },
      };

      await consumer.handle({ notificationId: 'n1' }, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.dlqEntry.originalQueue).toBe('q.test');
      expect(record.dlqEntry.originalExchange).toBe('xch.test');
    });

    it('should handle completely missing headers', async () => {
      await consumer.handle({ notificationId: 'n1' }, {});

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.dlqEntry.originalQueue).toBe('unknown');
      expect(record.dlqEntry.originalExchange).toBe('unknown');
      expect(record.dlqEntry.retryCount).toBe(0);
    });

    it('should store raw x-death headers in dlq entry', async () => {
      const xDeath = [
        { queue: 'q.test', exchange: 'xch.test', reason: 'rejected', count: 2 },
      ];
      const amqpMsg = { properties: { headers: { 'x-death': xDeath } } };

      await consumer.handle({}, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.dlqEntry.xDeathHeaders).toBe(xDeath);
    });

    it('should increment dlq entries metric with original queue', async () => {
      const amqpMsg = {
        properties: {
          headers: {
            'x-death': [{ queue: 'q.deliver.email.critical' }],
          },
        },
      };

      await consumer.handle({}, amqpMsg);

      expect(mockMetricsService.incrementDlqEntries).toHaveBeenCalledWith(
        'q.deliver.email.critical',
      );
    });

    it('should increment events ingested metric for DLQ_CAPTURED', async () => {
      await consumer.handle({}, {});

      expect(mockMetricsService.incrementEventsIngested).toHaveBeenCalledWith(
        'DLQ_CAPTURED',
        'audit-service',
      );
    });

    it('should create audit event with DLQ metadata', async () => {
      const amqpMsg = {
        properties: {
          headers: {
            'x-death': [
              {
                queue: 'q.test',
                exchange: 'xch.test',
                'routing-keys': ['test.key'],
                reason: 'rejected',
                count: 5,
              },
            ],
          },
        },
      };

      await consumer.handle({ notificationId: 'n1' }, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.auditEvent.metadata).toEqual({
        originalQueue: 'q.test',
        originalExchange: 'xch.test',
        originalRoutingKey: 'test.key',
        rejectionReason: 'rejected',
        retryCount: 5,
      });
    });

    it('should ACK on null message', async () => {
      const result = await consumer.handle(null as any, {});
      expect(result).toBeUndefined();
      expect(
        mockMetricsService.incrementDeserializationErrors,
      ).toHaveBeenCalledWith(QUEUE_AUDIT_DLQ);
    });

    it('should ACK on processing error', async () => {
      mockBatchBuffer.add.mockRejectedValue(new Error('fail'));

      const result = await consumer.handle(
        { notificationId: 'n1' },
        { properties: { headers: { 'x-death': [{ queue: 'q.test' }] } } },
      );
      expect(result).toBeUndefined();
    });
  });
});
