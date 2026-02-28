import { DeliverConsumer } from './deliver.consumer';
import { BatchBufferService } from './batch-buffer.service';
import { QUEUE_AUDIT_DELIVER } from '../rabbitmq/rabbitmq.constants';

describe('DeliverConsumer', () => {
  let consumer: DeliverConsumer;
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

    consumer = new DeliverConsumer(
      mockBatchBuffer,
      mockAuditEventsRepo,
      mockMetricsService,
    );
  });

  describe('onModuleInit', () => {
    it('should register flush handler for audit.deliver queue', () => {
      consumer.onModuleInit();
      expect(mockBatchBuffer.registerFlushHandler).toHaveBeenCalledWith(
        QUEUE_AUDIT_DELIVER,
        expect.any(Function),
      );
    });
  });

  describe('handle', () => {
    beforeEach(() => {
      consumer.onModuleInit();
    });

    it('should process a delivery dispatch message', async () => {
      const message = {
        notificationId: 'notif-1',
        correlationId: 'corr-1',
        cycleId: 'cycle-1',
        channel: 'email',
        priority: 'critical',
        recipients: [{ email: 'a@b.com' }],
      };

      await consumer.handle(message, {});

      expect(mockBatchBuffer.add).toHaveBeenCalledWith(
        QUEUE_AUDIT_DELIVER,
        expect.objectContaining({
          notificationId: 'notif-1',
          correlationId: 'corr-1',
          cycleId: 'cycle-1',
          eventType: 'DELIVERY_DISPATCHED',
          actor: 'notification-engine-service',
        }),
      );
    });

    it('should set actor to notification-engine-service', async () => {
      await consumer.handle({ notificationId: 'n1' }, {});

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.actor).toBe('notification-engine-service');
    });

    it('should include channel and priority in metadata', async () => {
      const message = {
        notificationId: 'n1',
        channel: 'sms',
        priority: 'normal',
        recipients: [{ phone: '123' }, { phone: '456' }],
      };

      await consumer.handle(message, {});

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.metadata.channel).toBe('sms');
      expect(record.metadata.priority).toBe('normal');
      expect(record.metadata.recipientCount).toBe(2);
    });

    it('should store full message as payload snapshot', async () => {
      const message = { notificationId: 'n1', extra: 'data' };

      await consumer.handle(message, {});

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.payloadSnapshot).toBe(message);
    });

    it('should increment events ingested metric', async () => {
      await consumer.handle({ notificationId: 'n1' }, {});

      expect(mockMetricsService.incrementEventsIngested).toHaveBeenCalledWith(
        'DELIVERY_DISPATCHED',
        'notification-engine-service',
      );
    });

    it('should ACK on null message', async () => {
      const result = await consumer.handle(null as any, {});
      expect(result).toBeUndefined();
      expect(
        mockMetricsService.incrementDeserializationErrors,
      ).toHaveBeenCalledWith(QUEUE_AUDIT_DELIVER);
    });

    it('should ACK on processing error', async () => {
      mockBatchBuffer.add.mockRejectedValue(new Error('fail'));

      const result = await consumer.handle({ valid: true } as any, {});
      expect(result).toBeUndefined();
      expect(
        mockMetricsService.incrementDeserializationErrors,
      ).toHaveBeenCalledWith(QUEUE_AUDIT_DELIVER);
    });

    it('should handle missing optional fields gracefully', async () => {
      const message = {};
      await consumer.handle(message, {});

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.notificationId).toBeNull();
      expect(record.correlationId).toBeNull();
      expect(record.cycleId).toBeNull();
    });
  });
});
