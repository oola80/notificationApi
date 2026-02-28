import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { EventsConsumer } from '../src/consumers/events.consumer';
import { DeliverConsumer } from '../src/consumers/deliver.consumer';
import { StatusConsumer } from '../src/consumers/status.consumer';
import { TemplateConsumer } from '../src/consumers/template.consumer';
import { DlqConsumer } from '../src/consumers/dlq.consumer';
import { BatchBufferService } from '../src/consumers/batch-buffer.service';
import { AuditEventsRepository } from '../src/events/audit-events.repository';
import { DeliveryReceiptsRepository } from '../src/receipts/delivery-receipts.repository';
import { DlqEntriesRepository } from '../src/dlq/dlq-entries.repository';
import { MetricsService } from '../src/metrics/metrics.service';
import { ConfigService } from '@nestjs/config';

describe('Consumers (E2E)', () => {
  let app: INestApplication;
  let eventsConsumer: EventsConsumer;
  let deliverConsumer: DeliverConsumer;
  let statusConsumer: StatusConsumer;
  let templateConsumer: TemplateConsumer;
  let dlqConsumer: DlqConsumer;
  let batchBuffer: BatchBufferService;
  let mockAuditEventsRepo: any;
  let mockReceiptsRepo: any;
  let mockDlqEntriesRepo: any;
  let mockMetricsService: any;

  beforeAll(async () => {
    const insertedAuditEvents: any[] = [];
    const insertedReceipts: any[] = [];
    const insertedDlqEntries: any[] = [];

    mockAuditEventsRepo = {
      insertMany: jest.fn(async (records: any[]) => {
        insertedAuditEvents.push(...records);
      }),
      findById: jest.fn(),
      findWithPagination: jest.fn(),
      _inserted: insertedAuditEvents,
    };

    mockReceiptsRepo = {
      insertMany: jest.fn(async (records: any[]) => {
        insertedReceipts.push(...records);
      }),
      findById: jest.fn(),
      findWithPagination: jest.fn(),
      _inserted: insertedReceipts,
    };

    mockDlqEntriesRepo = {
      insertMany: jest.fn(async (records: any[]) => {
        insertedDlqEntries.push(...records);
      }),
      findById: jest.fn(),
      findWithPagination: jest.fn(),
      countPending: jest.fn().mockResolvedValue(0),
      _inserted: insertedDlqEntries,
    };

    mockMetricsService = {
      incrementEventsIngested: jest.fn(),
      incrementReceiptsIngested: jest.fn(),
      incrementOrphanedReceipts: jest.fn(),
      incrementDlqEntries: jest.fn(),
      incrementDeserializationErrors: jest.fn(),
      incrementPoisonMessages: jest.fn(),
      observeConsumerBatchDuration: jest.fn(),
      observeConsumerBatchSize: jest.fn(),
      setConsumerLag: jest.fn(),
      registry: { metrics: jest.fn().mockResolvedValue('') },
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'app.consumerBatchSize': 50,
          'app.consumerFlushIntervalMs': 50,
          'app.consumerRetryDelayMs': 10,
          'app.consumerMaxRetries': 3,
        };
        return config[key] ?? defaultValue;
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [
        BatchBufferService,
        EventsConsumer,
        DeliverConsumer,
        StatusConsumer,
        TemplateConsumer,
        DlqConsumer,
        { provide: AuditEventsRepository, useValue: mockAuditEventsRepo },
        { provide: DeliveryReceiptsRepository, useValue: mockReceiptsRepo },
        { provide: DlqEntriesRepository, useValue: mockDlqEntriesRepo },
        { provide: MetricsService, useValue: mockMetricsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    batchBuffer = moduleFixture.get(BatchBufferService);
    eventsConsumer = moduleFixture.get(EventsConsumer);
    deliverConsumer = moduleFixture.get(DeliverConsumer);
    statusConsumer = moduleFixture.get(StatusConsumer);
    templateConsumer = moduleFixture.get(TemplateConsumer);
    dlqConsumer = moduleFixture.get(DlqConsumer);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    mockAuditEventsRepo._inserted.length = 0;
    mockReceiptsRepo._inserted.length = 0;
    mockDlqEntriesRepo._inserted.length = 0;
    jest.clearAllMocks();
  });

  describe('EventsConsumer E2E', () => {
    it('should persist normalized event as audit event', async () => {
      const message = {
        eventId: 'evt-e2e-1',
        sourceId: 'source-1',
        eventType: 'order.created',
        priority: 'normal',
        correlationId: 'corr-e2e',
        cycleId: 'cycle-e2e',
        normalizedPayload: { orderId: '123' },
      };

      await eventsConsumer.handle(message, {});
      // Wait for timer-based flush
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAuditEventsRepo.insertMany).toHaveBeenCalled();
      const inserted = mockAuditEventsRepo._inserted;
      expect(inserted.length).toBeGreaterThanOrEqual(1);

      const event = inserted.find(
        (e: any) => e.notificationId === 'evt-e2e-1',
      );
      expect(event).toBeDefined();
      expect(event.eventType).toBe('EVENT_NORMALIZED');
      expect(event.actor).toBe('event-ingestion-service');
      expect(event.correlationId).toBe('corr-e2e');
    });
  });

  describe('DeliverConsumer E2E', () => {
    it('should persist delivery dispatch as audit event', async () => {
      const message = {
        notificationId: 'notif-e2e-1',
        correlationId: 'corr-e2e-2',
        channel: 'email',
        priority: 'critical',
      };

      await deliverConsumer.handle(message, {});
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAuditEventsRepo.insertMany).toHaveBeenCalled();
      const event = mockAuditEventsRepo._inserted.find(
        (e: any) => e.notificationId === 'notif-e2e-1',
      );
      expect(event).toBeDefined();
      expect(event.eventType).toBe('DELIVERY_DISPATCHED');
      expect(event.actor).toBe('notification-engine-service');
    });
  });

  describe('StatusConsumer E2E — delivery path', () => {
    it('should persist delivery status as audit event', async () => {
      const message = {
        notificationId: 'notif-e2e-2',
        channel: 'email',
        provider: 'mailgun',
        toStatus: 'sent',
        providerMessageId: 'pmid-e2e-1',
      };
      const amqpMsg = { fields: { routingKey: 'notification.status.sent' } };

      await statusConsumer.handle(message, amqpMsg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAuditEventsRepo.insertMany).toHaveBeenCalled();
      const event = mockAuditEventsRepo._inserted.find(
        (e: any) => e.notificationId === 'notif-e2e-2',
      );
      expect(event).toBeDefined();
      expect(event.eventType).toBe('DELIVERY_SENT');
    });

    it('should persist delivery receipt when sent with providerMessageId', async () => {
      const message = {
        notificationId: 'notif-e2e-3',
        channel: 'email',
        provider: 'mailgun',
        toStatus: 'sent',
        providerMessageId: 'pmid-e2e-2',
      };
      const amqpMsg = { fields: { routingKey: 'notification.status.sent' } };

      await statusConsumer.handle(message, amqpMsg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockReceiptsRepo.insertMany).toHaveBeenCalled();
      const receipt = mockReceiptsRepo._inserted.find(
        (r: any) => r.providerMessageId === 'pmid-e2e-2',
      );
      expect(receipt).toBeDefined();
      expect(receipt.status).toBe('sent');
    });
  });

  describe('StatusConsumer E2E — webhook path', () => {
    it('should persist webhook event as audit event + delivery receipt', async () => {
      const message = {
        notificationId: 'notif-e2e-4',
        providerMessageId: 'pmid-e2e-3',
        status: 'delivered',
        channel: 'email',
        provider: 'mailgun',
      };
      const amqpMsg = { fields: { routingKey: 'adapter.webhook.mailgun' } };

      await statusConsumer.handle(message, amqpMsg);
      await new Promise((r) => setTimeout(r, 100));

      const event = mockAuditEventsRepo._inserted.find(
        (e: any) => e.notificationId === 'notif-e2e-4',
      );
      expect(event).toBeDefined();
      expect(event.eventType).toBe('DELIVERED');
      expect(event.actor).toBe('adapter-mailgun');

      const receipt = mockReceiptsRepo._inserted.find(
        (r: any) => r.providerMessageId === 'pmid-e2e-3',
      );
      expect(receipt).toBeDefined();
      expect(receipt.status).toBe('delivered');
    });

    it('should handle orphaned webhook receipt', async () => {
      const message = {
        providerMessageId: 'pmid-orphan-e2e',
        status: 'bounced',
        channel: 'email',
        provider: 'mailgun',
      };
      const amqpMsg = { fields: { routingKey: 'adapter.webhook.mailgun' } };

      await statusConsumer.handle(message, amqpMsg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockMetricsService.incrementOrphanedReceipts).toHaveBeenCalledWith(
        'mailgun',
      );

      const receipt = mockReceiptsRepo._inserted.find(
        (r: any) => r.providerMessageId === 'pmid-orphan-e2e',
      );
      expect(receipt).toBeDefined();
      expect(receipt.notificationId).toBeNull();
    });
  });

  describe('TemplateConsumer E2E', () => {
    it('should persist template lifecycle event', async () => {
      const message = {
        templateId: 'tmpl-e2e-1',
        slug: 'order-delay',
        version: 5,
        action: 'updated',
      };
      const amqpMsg = { fields: { routingKey: 'template.updated' } };

      await templateConsumer.handle(message, amqpMsg);
      await new Promise((r) => setTimeout(r, 100));

      expect(mockAuditEventsRepo.insertMany).toHaveBeenCalled();
      const event = mockAuditEventsRepo._inserted.find(
        (e: any) => e.notificationId === 'tmpl-e2e-1',
      );
      expect(event).toBeDefined();
      expect(event.eventType).toBe('TEMPLATE_UPDATED');
      expect(event.actor).toBe('template-service');
    });
  });

  describe('DlqConsumer E2E', () => {
    it('should persist DLQ entry and audit event', async () => {
      const message = {
        notificationId: 'notif-e2e-dlq',
        correlationId: 'corr-dlq',
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

      await dlqConsumer.handle(message, amqpMsg);
      await new Promise((r) => setTimeout(r, 100));

      // Verify DLQ entry
      expect(mockDlqEntriesRepo.insertMany).toHaveBeenCalled();
      const dlqEntry = mockDlqEntriesRepo._inserted.find(
        (e: any) => e.originalQueue === 'q.deliver.email.critical',
      );
      expect(dlqEntry).toBeDefined();
      expect(dlqEntry.status).toBe('pending');
      expect(dlqEntry.retryCount).toBe(3);

      // Verify audit event
      const auditEvent = mockAuditEventsRepo._inserted.find(
        (e: any) =>
          e.eventType === 'DLQ_CAPTURED' &&
          e.notificationId === 'notif-e2e-dlq',
      );
      expect(auditEvent).toBeDefined();
      expect(auditEvent.actor).toBe('audit-service');

      // Verify metrics
      expect(mockMetricsService.incrementDlqEntries).toHaveBeenCalledWith(
        'q.deliver.email.critical',
      );
    });
  });
});
