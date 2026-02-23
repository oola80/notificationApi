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
  readonly receivedTotal: Counter;
  readonly publishedTotal: Counter;
  readonly failedTotal: Counter;
  readonly duplicateTotal: Counter;
  readonly validationErrorsTotal: Counter;
  readonly mappingNotFoundTotal: Counter;
  readonly mappingCacheInvalidationsTotal: Counter;

  // Histogram
  readonly processingDuration: Histogram;

  // Gauges
  readonly queueDepth: Gauge;
  readonly consumerLag: Gauge;
  readonly dlqDepth: Gauge;
  readonly servicePoolActive: Gauge;
  readonly mappingCacheHitRate: Gauge;

  constructor() {
    this.receivedTotal = new Counter({
      name: 'event_ingestion_received_total',
      help: 'Total events received',
      labelNames: ['sourceId'],
      registers: [this.registry],
    });

    this.publishedTotal = new Counter({
      name: 'event_ingestion_published_total',
      help: 'Total events successfully published',
      registers: [this.registry],
    });

    this.failedTotal = new Counter({
      name: 'event_ingestion_failed_total',
      help: 'Total events that failed processing',
      registers: [this.registry],
    });

    this.duplicateTotal = new Counter({
      name: 'event_ingestion_duplicate_total',
      help: 'Total duplicate events detected',
      registers: [this.registry],
    });

    this.validationErrorsTotal = new Counter({
      name: 'event_ingestion_validation_errors_total',
      help: 'Total validation errors',
      labelNames: ['sourceId'],
      registers: [this.registry],
    });

    this.mappingNotFoundTotal = new Counter({
      name: 'event_ingestion_mapping_not_found_total',
      help: 'Total mapping not found errors',
      registers: [this.registry],
    });

    this.mappingCacheInvalidationsTotal = new Counter({
      name: 'event_ingestion_mapping_cache_invalidations_total',
      help: 'Total mapping cache invalidations',
      registers: [this.registry],
    });

    this.processingDuration = new Histogram({
      name: 'event_ingestion_processing_duration_ms',
      help: 'Event processing duration in milliseconds',
      buckets: [5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.registry],
    });

    this.queueDepth = new Gauge({
      name: 'event_ingestion_queue_depth',
      help: 'Current queue depth',
      labelNames: ['queue_name'],
      registers: [this.registry],
    });

    this.consumerLag = new Gauge({
      name: 'event_ingestion_consumer_lag',
      help: 'Consumer lag per queue',
      labelNames: ['queue_name'],
      registers: [this.registry],
    });

    this.dlqDepth = new Gauge({
      name: 'event_ingestion_dlq_depth',
      help: 'Dead letter queue depth',
      registers: [this.registry],
    });

    this.servicePoolActive = new Gauge({
      name: 'event_ingestion_service_pool_active',
      help: 'Active service pool connections',
      registers: [this.registry],
    });

    this.mappingCacheHitRate = new Gauge({
      name: 'event_ingestion_mapping_cache_hit_rate',
      help: 'Mapping cache hit rate (0-1)',
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  incrementReceived(sourceId: string): void {
    this.receivedTotal.inc({ sourceId });
  }

  incrementPublished(): void {
    this.publishedTotal.inc();
  }

  incrementFailed(): void {
    this.failedTotal.inc();
  }

  incrementDuplicate(): void {
    this.duplicateTotal.inc();
  }

  incrementValidationError(sourceId: string): void {
    this.validationErrorsTotal.inc({ sourceId });
  }

  incrementMappingNotFound(): void {
    this.mappingNotFoundTotal.inc();
  }

  incrementCacheInvalidation(): void {
    this.mappingCacheInvalidationsTotal.inc();
  }

  observeProcessingDuration(ms: number): void {
    this.processingDuration.observe(ms);
  }
}
