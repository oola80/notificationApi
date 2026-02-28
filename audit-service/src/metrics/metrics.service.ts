import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  // Counters
  readonly eventsIngestedTotal: Counter;
  readonly receiptsIngestedTotal: Counter;
  readonly orphanedReceiptsTotal: Counter;
  readonly dlqEntriesTotal: Counter;
  readonly deserializationErrorsTotal: Counter;
  readonly poisonMessagesTotal: Counter;

  // Histograms
  readonly consumerBatchDurationMs: Histogram;
  readonly consumerBatchSize: Histogram;
  readonly traceDurationMs: Histogram;
  readonly searchDurationMs: Histogram;
  readonly aggregationDurationMs: Histogram;

  // Gauges
  readonly consumerLag: Gauge;
  readonly dbPoolActive: Gauge;
  readonly dbPoolIdle: Gauge;
  readonly dlqPendingCount: Gauge;

  constructor() {
    this.eventsIngestedTotal = new Counter({
      name: 'audit_events_ingested_total',
      help: 'Total audit events persisted',
      labelNames: ['event_type', 'actor'],
      registers: [this.registry],
    });

    this.receiptsIngestedTotal = new Counter({
      name: 'audit_receipts_ingested_total',
      help: 'Total delivery receipts persisted',
      labelNames: ['channel', 'provider', 'status'],
      registers: [this.registry],
    });

    this.orphanedReceiptsTotal = new Counter({
      name: 'audit_orphaned_receipts_total',
      help: 'Receipts with no matching notification',
      labelNames: ['provider'],
      registers: [this.registry],
    });

    this.dlqEntriesTotal = new Counter({
      name: 'audit_dlq_entries_total',
      help: 'Total DLQ entries captured',
      labelNames: ['original_queue'],
      registers: [this.registry],
    });

    this.deserializationErrorsTotal = new Counter({
      name: 'audit_deserialization_errors_total',
      help: 'Messages that failed to deserialize',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.poisonMessagesTotal = new Counter({
      name: 'audit_poison_messages_total',
      help: 'Messages discarded as poison after max retries',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.consumerBatchDurationMs = new Histogram({
      name: 'audit_consumer_batch_duration_ms',
      help: 'Time to flush a consumer batch',
      labelNames: ['queue'],
      buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry],
    });

    this.consumerBatchSize = new Histogram({
      name: 'audit_consumer_batch_size',
      help: 'Number of messages per batch flush',
      labelNames: ['queue'],
      buckets: [1, 5, 10, 25, 50, 100, 200],
      registers: [this.registry],
    });

    this.traceDurationMs = new Histogram({
      name: 'audit_trace_duration_ms',
      help: 'Time to reconstruct a notification trace',
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry],
    });

    this.searchDurationMs = new Histogram({
      name: 'audit_search_duration_ms',
      help: 'Full-text search query execution time',
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry],
    });

    this.aggregationDurationMs = new Histogram({
      name: 'audit_aggregation_duration_ms',
      help: 'Time to complete aggregation job',
      labelNames: ['period'],
      buckets: [100, 500, 1000, 5000, 10000, 30000, 60000],
      registers: [this.registry],
    });

    this.consumerLag = new Gauge({
      name: 'audit_consumer_lag',
      help: 'Approximate message backlog per queue',
      labelNames: ['queue'],
      registers: [this.registry],
    });

    this.dbPoolActive = new Gauge({
      name: 'audit_db_pool_active',
      help: 'Active database connections',
      registers: [this.registry],
    });

    this.dbPoolIdle = new Gauge({
      name: 'audit_db_pool_idle',
      help: 'Idle database connections',
      registers: [this.registry],
    });

    this.dlqPendingCount = new Gauge({
      name: 'audit_dlq_pending_count',
      help: 'Current pending DLQ entries',
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  incrementEventsIngested(eventType: string, actor: string): void {
    this.eventsIngestedTotal.inc({ event_type: eventType, actor });
  }

  incrementReceiptsIngested(
    channel: string,
    provider: string,
    status: string,
  ): void {
    this.receiptsIngestedTotal.inc({ channel, provider, status });
  }

  incrementOrphanedReceipts(provider: string): void {
    this.orphanedReceiptsTotal.inc({ provider });
  }

  incrementDlqEntries(originalQueue: string): void {
    this.dlqEntriesTotal.inc({ original_queue: originalQueue });
  }

  incrementDeserializationErrors(queue: string): void {
    this.deserializationErrorsTotal.inc({ queue });
  }

  incrementPoisonMessages(queue: string): void {
    this.poisonMessagesTotal.inc({ queue });
  }

  observeConsumerBatchDuration(queue: string, durationMs: number): void {
    this.consumerBatchDurationMs.observe({ queue }, durationMs);
  }

  observeConsumerBatchSize(queue: string, size: number): void {
    this.consumerBatchSize.observe({ queue }, size);
  }

  observeTraceDuration(durationMs: number): void {
    this.traceDurationMs.observe(durationMs);
  }

  observeSearchDuration(durationMs: number): void {
    this.searchDurationMs.observe(durationMs);
  }

  observeAggregationDuration(period: string, durationMs: number): void {
    this.aggregationDurationMs.observe({ period }, durationMs);
  }

  setConsumerLag(queue: string, lag: number): void {
    this.consumerLag.set({ queue }, lag);
  }

  setDbPoolActive(count: number): void {
    this.dbPoolActive.set(count);
  }

  setDbPoolIdle(count: number): void {
    this.dbPoolIdle.set(count);
  }

  setDlqPendingCount(count: number): void {
    this.dlqPendingCount.set(count);
  }
}
