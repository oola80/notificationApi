import { StatusConsumer } from './status.consumer';
import { BatchBufferService } from './batch-buffer.service';
import { QUEUE_STATUS_UPDATES } from '../rabbitmq/rabbitmq.constants';

describe('StatusConsumer', () => {
  let consumer: StatusConsumer;
  let mockBatchBuffer: jest.Mocked<BatchBufferService>;
  let mockAuditEventsRepo: any;
  let mockReceiptsRepo: any;
  let mockMetricsService: any;

  beforeEach(() => {
    mockBatchBuffer = {
      registerFlushHandler: jest.fn(),
      add: jest.fn().mockResolvedValue(undefined),
    } as any;

    mockAuditEventsRepo = {
      insertMany: jest.fn().mockResolvedValue(undefined),
    };

    mockReceiptsRepo = {
      insertMany: jest.fn().mockResolvedValue(undefined),
    };

    mockMetricsService = {
      incrementEventsIngested: jest.fn(),
      incrementReceiptsIngested: jest.fn(),
      incrementOrphanedReceipts: jest.fn(),
      incrementDeserializationErrors: jest.fn(),
    };

    consumer = new StatusConsumer(
      mockBatchBuffer,
      mockAuditEventsRepo,
      mockReceiptsRepo,
      mockMetricsService,
    );
  });

  describe('onModuleInit', () => {
    it('should register flush handler for q.status.updates queue', () => {
      consumer.onModuleInit();
      expect(mockBatchBuffer.registerFlushHandler).toHaveBeenCalledWith(
        QUEUE_STATUS_UPDATES,
        expect.any(Function),
      );
    });

    it('flush handler should insert audit events and delivery receipts', async () => {
      consumer.onModuleInit();
      const handler = mockBatchBuffer.registerFlushHandler.mock.calls[0][1];

      const records = [
        {
          auditEvent: { eventType: 'DELIVERY_SENT' },
          deliveryReceipt: { status: 'sent' },
        },
        {
          auditEvent: { eventType: 'DELIVERY_FAILED' },
          deliveryReceipt: null,
        },
      ];

      await handler(records);

      expect(mockAuditEventsRepo.insertMany).toHaveBeenCalledWith([
        { eventType: 'DELIVERY_SENT' },
        { eventType: 'DELIVERY_FAILED' },
      ]);
      expect(mockReceiptsRepo.insertMany).toHaveBeenCalledWith([
        { status: 'sent' },
      ]);
    });

    it('flush handler should skip receipt insert when none present', async () => {
      consumer.onModuleInit();
      const handler = mockBatchBuffer.registerFlushHandler.mock.calls[0][1];

      await handler([
        { auditEvent: { eventType: 'DELIVERY_FAILED' }, deliveryReceipt: null },
      ]);

      expect(mockAuditEventsRepo.insertMany).toHaveBeenCalledTimes(1);
      expect(mockReceiptsRepo.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('delivery-path messages', () => {
    beforeEach(() => {
      consumer.onModuleInit();
    });

    it.each([
      ['attempted', 'DELIVERY_ATTEMPTED'],
      ['sent', 'DELIVERY_SENT'],
      ['failed', 'DELIVERY_FAILED'],
      ['retrying', 'DELIVERY_RETRYING'],
    ])(
      'should map status "%s" to event type "%s"',
      async (status, expectedEventType) => {
        const message = {
          notificationId: 'n1',
          correlationId: 'c1',
          cycleId: 'cy1',
          channel: 'email',
          provider: 'mailgun',
          fromStatus: 'pending',
          toStatus: status,
        };
        const amqpMsg = { fields: { routingKey: `notification.status.${status}` } };

        await consumer.handle(message, amqpMsg);

        const record = mockBatchBuffer.add.mock.calls[0][1];
        expect(record.auditEvent.eventType).toBe(expectedEventType);
        expect(record.auditEvent.actor).toBe('channel-router-service');
      },
    );

    it('should create delivery receipt when status is sent with providerMessageId', async () => {
      const message = {
        notificationId: 'n1',
        correlationId: 'c1',
        cycleId: 'cy1',
        channel: 'email',
        provider: 'mailgun',
        toStatus: 'sent',
        providerMessageId: 'pmid-123',
        providerResponse: { id: 'pmid-123' },
      };
      const amqpMsg = { fields: { routingKey: 'notification.status.sent' } };

      await consumer.handle(message, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.deliveryReceipt).not.toBeNull();
      expect(record.deliveryReceipt.providerMessageId).toBe('pmid-123');
      expect(record.deliveryReceipt.status).toBe('sent');
      expect(record.deliveryReceipt.channel).toBe('email');
      expect(record.deliveryReceipt.provider).toBe('mailgun');
      expect(mockMetricsService.incrementReceiptsIngested).toHaveBeenCalledWith(
        'email',
        'mailgun',
        'sent',
      );
    });

    it('should NOT create delivery receipt for non-sent statuses', async () => {
      const message = {
        notificationId: 'n1',
        channel: 'email',
        provider: 'mailgun',
        toStatus: 'attempted',
      };
      const amqpMsg = { fields: { routingKey: 'notification.status.attempted' } };

      await consumer.handle(message, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.deliveryReceipt).toBeNull();
    });

    it('should NOT create delivery receipt for sent without providerMessageId', async () => {
      const message = {
        notificationId: 'n1',
        channel: 'email',
        provider: 'mailgun',
        toStatus: 'sent',
      };
      const amqpMsg = { fields: { routingKey: 'notification.status.sent' } };

      await consumer.handle(message, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.deliveryReceipt).toBeNull();
    });
  });

  describe('webhook messages', () => {
    beforeEach(() => {
      consumer.onModuleInit();
    });

    it.each([
      ['delivered', 'DELIVERED'],
      ['bounced', 'BOUNCED'],
      ['opened', 'OPENED'],
      ['clicked', 'CLICKED'],
      ['unsubscribed', 'UNSUBSCRIBED'],
      ['spam_complaint', 'SPAM_COMPLAINT'],
    ])(
      'should map webhook status "%s" to event type "%s"',
      async (status, expectedEventType) => {
        const message = {
          notificationId: 'n1',
          providerMessageId: 'pmid-1',
          status,
          channel: 'email',
          provider: 'mailgun',
        };
        const amqpMsg = {
          fields: { routingKey: 'adapter.webhook.mailgun' },
        };

        await consumer.handle(message, amqpMsg);

        const record = mockBatchBuffer.add.mock.calls[0][1];
        expect(record.auditEvent.eventType).toBe(expectedEventType);
        expect(record.auditEvent.actor).toBe('adapter-mailgun');
      },
    );

    it('should always create delivery receipt for webhook messages', async () => {
      const message = {
        notificationId: 'n1',
        providerMessageId: 'pmid-1',
        status: 'delivered',
        channel: 'email',
        provider: 'mailgun',
      };
      const amqpMsg = {
        fields: { routingKey: 'adapter.webhook.mailgun' },
      };

      await consumer.handle(message, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.deliveryReceipt).not.toBeNull();
      expect(record.deliveryReceipt.providerMessageId).toBe('pmid-1');
      expect(record.deliveryReceipt.status).toBe('delivered');
    });

    it('should detect orphaned receipts (no notificationId)', async () => {
      const message = {
        providerMessageId: 'pmid-orphan',
        status: 'delivered',
        channel: 'email',
        provider: 'mailgun',
      };
      const amqpMsg = {
        fields: { routingKey: 'adapter.webhook.mailgun' },
      };

      await consumer.handle(message, amqpMsg);

      expect(mockMetricsService.incrementOrphanedReceipts).toHaveBeenCalledWith(
        'mailgun',
      );

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.auditEvent.notificationId).toBeNull();
      expect(record.deliveryReceipt.notificationId).toBeNull();
      expect(record.auditEvent.metadata.isOrphaned).toBe(true);
    });

    it('should NOT flag orphaned receipt when notificationId present', async () => {
      const message = {
        notificationId: 'n1',
        providerMessageId: 'pmid-1',
        status: 'delivered',
        channel: 'email',
        provider: 'mailgun',
      };
      const amqpMsg = {
        fields: { routingKey: 'adapter.webhook.mailgun' },
      };

      await consumer.handle(message, amqpMsg);

      expect(
        mockMetricsService.incrementOrphanedReceipts,
      ).not.toHaveBeenCalled();
    });

    it('should extract provider from routing key for actor', async () => {
      const amqpMsg = {
        fields: { routingKey: 'adapter.webhook.braze' },
      };

      await consumer.handle(
        { status: 'delivered', channel: 'sms', provider: 'braze' },
        amqpMsg,
      );

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.auditEvent.actor).toBe('adapter-braze');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      consumer.onModuleInit();
    });

    it('should ACK on null message', async () => {
      const result = await consumer.handle(null as any, {});
      expect(result).toBeUndefined();
      expect(
        mockMetricsService.incrementDeserializationErrors,
      ).toHaveBeenCalledWith(QUEUE_STATUS_UPDATES);
    });

    it('should ACK on processing error', async () => {
      mockBatchBuffer.add.mockRejectedValue(new Error('boom'));

      const result = await consumer.handle(
        { notificationId: 'n1' },
        { fields: { routingKey: 'notification.status.sent' } },
      );
      expect(result).toBeUndefined();
    });

    it('should handle missing routing key gracefully', async () => {
      await consumer.handle({ notificationId: 'n1' }, {});

      const record = mockBatchBuffer.add.mock.calls[0][1];
      // Should default to delivery-path handling since routing key is empty
      expect(record.auditEvent.actor).toBe('channel-router-service');
    });
  });
});
