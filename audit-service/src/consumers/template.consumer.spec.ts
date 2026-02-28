import { TemplateConsumer } from './template.consumer';
import { BatchBufferService } from './batch-buffer.service';
import { QUEUE_AUDIT_TEMPLATE } from '../rabbitmq/rabbitmq.constants';

describe('TemplateConsumer', () => {
  let consumer: TemplateConsumer;
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

    consumer = new TemplateConsumer(
      mockBatchBuffer,
      mockAuditEventsRepo,
      mockMetricsService,
    );
  });

  describe('onModuleInit', () => {
    it('should register flush handler for q.audit.template queue', () => {
      consumer.onModuleInit();
      expect(mockBatchBuffer.registerFlushHandler).toHaveBeenCalledWith(
        QUEUE_AUDIT_TEMPLATE,
        expect.any(Function),
      );
    });
  });

  describe('handle', () => {
    beforeEach(() => {
      consumer.onModuleInit();
    });

    it.each([
      ['created', 'TEMPLATE_CREATED'],
      ['updated', 'TEMPLATE_UPDATED'],
      ['deleted', 'TEMPLATE_DELETED'],
      ['rolledback', 'TEMPLATE_ROLLEDBACK'],
    ])(
      'should map action "%s" to event type "%s"',
      async (action, expectedEventType) => {
        const message = {
          templateId: 'tmpl-1',
          slug: 'order-confirmation',
          version: 3,
          action,
          userId: 'user-1',
        };
        const amqpMsg = { fields: { routingKey: `template.${action}` } };

        await consumer.handle(message, amqpMsg);

        const record = mockBatchBuffer.add.mock.calls[0][1];
        expect(record.eventType).toBe(expectedEventType);
        expect(record.actor).toBe('template-service');
      },
    );

    it('should set notificationId to templateId', async () => {
      const message = { templateId: 'tmpl-99' };
      const amqpMsg = { fields: { routingKey: 'template.created' } };

      await consumer.handle(message, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.notificationId).toBe('tmpl-99');
    });

    it('should include template metadata', async () => {
      const message = {
        templateId: 'tmpl-1',
        slug: 'welcome-email',
        version: 2,
        action: 'updated',
        userId: 'admin-1',
      };
      const amqpMsg = { fields: { routingKey: 'template.updated' } };

      await consumer.handle(message, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.metadata).toEqual({
        templateId: 'tmpl-1',
        slug: 'welcome-email',
        version: 2,
        action: 'updated',
        userId: 'admin-1',
      });
    });

    it('should store full message as payload snapshot', async () => {
      const message = { templateId: 'tmpl-1', slug: 'test' };
      const amqpMsg = { fields: { routingKey: 'template.created' } };

      await consumer.handle(message, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.payloadSnapshot).toBe(message);
    });

    it('should set cycleId to null', async () => {
      const message = { templateId: 'tmpl-1' };
      const amqpMsg = { fields: { routingKey: 'template.created' } };

      await consumer.handle(message, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.cycleId).toBeNull();
    });

    it('should increment events ingested metric', async () => {
      const amqpMsg = { fields: { routingKey: 'template.deleted' } };
      await consumer.handle({ templateId: 'tmpl-1' }, amqpMsg);

      expect(mockMetricsService.incrementEventsIngested).toHaveBeenCalledWith(
        'TEMPLATE_DELETED',
        'template-service',
      );
    });

    it('should handle unknown action gracefully', async () => {
      const amqpMsg = { fields: { routingKey: 'template.archived' } };
      await consumer.handle({ templateId: 'tmpl-1' }, amqpMsg);

      const record = mockBatchBuffer.add.mock.calls[0][1];
      expect(record.eventType).toBe('TEMPLATE_ARCHIVED');
    });

    it('should ACK on null message', async () => {
      const result = await consumer.handle(null as any, {});
      expect(result).toBeUndefined();
      expect(
        mockMetricsService.incrementDeserializationErrors,
      ).toHaveBeenCalledWith(QUEUE_AUDIT_TEMPLATE);
    });

    it('should ACK on processing error', async () => {
      mockBatchBuffer.add.mockRejectedValue(new Error('fail'));

      const result = await consumer.handle(
        { templateId: 'tmpl-1' },
        { fields: { routingKey: 'template.created' } },
      );
      expect(result).toBeUndefined();
    });
  });
});
