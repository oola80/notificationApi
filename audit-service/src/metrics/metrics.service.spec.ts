import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have a registry', () => {
    expect(service.registry).toBeDefined();
  });

  describe('metric registration', () => {
    it('should register all 15 metrics', async () => {
      service.onModuleInit();
      const metricsText = await service.registry.metrics();

      // Counters (6)
      expect(metricsText).toContain('audit_events_ingested_total');
      expect(metricsText).toContain('audit_receipts_ingested_total');
      expect(metricsText).toContain('audit_orphaned_receipts_total');
      expect(metricsText).toContain('audit_dlq_entries_total');
      expect(metricsText).toContain('audit_deserialization_errors_total');
      expect(metricsText).toContain('audit_poison_messages_total');

      // Histograms (5)
      expect(metricsText).toContain('audit_consumer_batch_duration_ms');
      expect(metricsText).toContain('audit_consumer_batch_size');
      expect(metricsText).toContain('audit_trace_duration_ms');
      expect(metricsText).toContain('audit_search_duration_ms');
      expect(metricsText).toContain('audit_aggregation_duration_ms');

      // Gauges (4)
      expect(metricsText).toContain('audit_consumer_lag');
      expect(metricsText).toContain('audit_db_pool_active');
      expect(metricsText).toContain('audit_db_pool_idle');
      expect(metricsText).toContain('audit_dlq_pending_count');
    });
  });

  describe('counter methods', () => {
    it('should increment events ingested', () => {
      expect(() =>
        service.incrementEventsIngested('DELIVERY_SENT', 'channel-router-service'),
      ).not.toThrow();
    });

    it('should increment receipts ingested', () => {
      expect(() =>
        service.incrementReceiptsIngested('email', 'mailgun', 'DELIVERED'),
      ).not.toThrow();
    });

    it('should increment orphaned receipts', () => {
      expect(() => service.incrementOrphanedReceipts('mailgun')).not.toThrow();
    });

    it('should increment DLQ entries', () => {
      expect(() =>
        service.incrementDlqEntries('q.deliver.email.normal'),
      ).not.toThrow();
    });

    it('should increment deserialization errors', () => {
      expect(() =>
        service.incrementDeserializationErrors('audit.events'),
      ).not.toThrow();
    });

    it('should increment poison messages', () => {
      expect(() =>
        service.incrementPoisonMessages('audit.events'),
      ).not.toThrow();
    });
  });

  describe('histogram methods', () => {
    it('should observe consumer batch duration', () => {
      expect(() =>
        service.observeConsumerBatchDuration('audit.events', 150),
      ).not.toThrow();
    });

    it('should observe consumer batch size', () => {
      expect(() =>
        service.observeConsumerBatchSize('audit.events', 50),
      ).not.toThrow();
    });

    it('should observe trace duration', () => {
      expect(() => service.observeTraceDuration(250)).not.toThrow();
    });

    it('should observe search duration', () => {
      expect(() => service.observeSearchDuration(100)).not.toThrow();
    });

    it('should observe aggregation duration', () => {
      expect(() =>
        service.observeAggregationDuration('hourly', 5000),
      ).not.toThrow();
    });
  });

  describe('gauge methods', () => {
    it('should set consumer lag', () => {
      expect(() =>
        service.setConsumerLag('audit.events', 100),
      ).not.toThrow();
    });

    it('should set DB pool active', () => {
      expect(() => service.setDbPoolActive(10)).not.toThrow();
    });

    it('should set DB pool idle', () => {
      expect(() => service.setDbPoolIdle(5)).not.toThrow();
    });

    it('should set DLQ pending count', () => {
      expect(() => service.setDlqPendingCount(8)).not.toThrow();
    });
  });
});
