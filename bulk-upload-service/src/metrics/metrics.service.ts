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
  readonly uploadsTotal: Counter;
  readonly uploadRowsTotal: Counter;

  // Histograms
  readonly uploadFileSizeBytes: Histogram;
  readonly uploadDurationSeconds: Histogram;

  // Worker metrics
  readonly workerProcessingDuration: Histogram;
  readonly workerBatchDuration: Histogram;
  readonly eventSubmissionDuration: Histogram;
  readonly eventSubmissionTotal: Counter;
  readonly workerActiveUploads: Gauge;
  readonly rowsPerSecond: Gauge;

  // Phase 3 metrics
  readonly circuitBreakerState: Gauge;
  readonly circuitBreakerTripsTotal: Counter;
  readonly rateLimiterWaitSeconds: Histogram;
  readonly groupSize: Histogram;
  readonly retryTotal: Counter;

  // RabbitMQ metrics
  readonly rabbitmqPublishTotal: Counter;
  readonly rabbitmqPublishDuration: Histogram;

  // Gauges
  readonly activeUploads: Gauge;

  constructor() {
    this.uploadsTotal = new Counter({
      name: 'bus_uploads_total',
      help: 'Total uploads by status',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.uploadRowsTotal = new Counter({
      name: 'bus_upload_rows_total',
      help: 'Total upload rows by status',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.uploadFileSizeBytes = new Histogram({
      name: 'bus_upload_file_size_bytes',
      help: 'Upload file size distribution in bytes',
      buckets: [
        102400, 256000, 512000, 1048576, 2097152, 5242880, 10485760,
      ],
      registers: [this.registry],
    });

    this.uploadDurationSeconds = new Histogram({
      name: 'bus_upload_duration_seconds',
      help: 'Upload processing duration in seconds',
      buckets: [1, 5, 10, 30, 60, 120, 300, 600],
      registers: [this.registry],
    });

    this.workerProcessingDuration = new Histogram({
      name: 'bus_worker_processing_duration_seconds',
      help: 'Worker processing duration per upload in seconds',
      buckets: [1, 5, 10, 30, 60, 120, 300, 600],
      registers: [this.registry],
    });

    this.workerBatchDuration = new Histogram({
      name: 'bus_worker_batch_duration_seconds',
      help: 'Worker batch processing duration in seconds',
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      registers: [this.registry],
    });

    this.eventSubmissionDuration = new Histogram({
      name: 'bus_event_submission_duration_seconds',
      help: 'Event submission duration per row in seconds',
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });

    this.eventSubmissionTotal = new Counter({
      name: 'bus_event_submission_total',
      help: 'Total event submissions by status',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.workerActiveUploads = new Gauge({
      name: 'bus_worker_active_uploads',
      help: 'Number of uploads currently being processed by worker',
      registers: [this.registry],
    });

    this.rowsPerSecond = new Gauge({
      name: 'bus_rows_per_second',
      help: 'Current rows processing rate per second',
      registers: [this.registry],
    });

    this.circuitBreakerState = new Gauge({
      name: 'bus_circuit_breaker_state',
      help: 'Circuit breaker state (0=closed, 1=open, 2=half_open)',
      registers: [this.registry],
    });

    this.circuitBreakerTripsTotal = new Counter({
      name: 'bus_circuit_breaker_trips_total',
      help: 'Total number of circuit breaker trips',
      registers: [this.registry],
    });

    this.rateLimiterWaitSeconds = new Histogram({
      name: 'bus_rate_limiter_wait_seconds',
      help: 'Rate limiter wait time distribution in seconds',
      buckets: [0, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.groupSize = new Histogram({
      name: 'bus_group_size',
      help: 'Number of items per group in group mode',
      buckets: [1, 2, 5, 10, 20, 50, 100, 200, 500],
      registers: [this.registry],
    });

    this.retryTotal = new Counter({
      name: 'bus_retry_total',
      help: 'Total number of upload retries',
      registers: [this.registry],
    });

    this.rabbitmqPublishTotal = new Counter({
      name: 'bus_rabbitmq_publish_total',
      help: 'Total RabbitMQ publish attempts by routing key and status',
      labelNames: ['routingKey', 'status'],
      registers: [this.registry],
    });

    this.rabbitmqPublishDuration = new Histogram({
      name: 'bus_rabbitmq_publish_duration_seconds',
      help: 'RabbitMQ publish duration in seconds',
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5],
      registers: [this.registry],
    });

    this.activeUploads = new Gauge({
      name: 'bus_active_uploads',
      help: 'Number of currently processing uploads',
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  incrementUploads(status: string): void {
    this.uploadsTotal.inc({ status });
  }

  incrementRows(status: string): void {
    this.uploadRowsTotal.inc({ status });
  }

  observeFileSize(bytes: number): void {
    this.uploadFileSizeBytes.observe(bytes);
  }

  observeDuration(seconds: number): void {
    this.uploadDurationSeconds.observe(seconds);
  }

  setActiveUploads(count: number): void {
    this.activeUploads.set(count);
  }

  observeWorkerProcessingDuration(seconds: number): void {
    this.workerProcessingDuration.observe(seconds);
  }

  observeWorkerBatchDuration(seconds: number): void {
    this.workerBatchDuration.observe(seconds);
  }

  observeEventSubmissionDuration(seconds: number): void {
    this.eventSubmissionDuration.observe(seconds);
  }

  incrementEventSubmission(status: string): void {
    this.eventSubmissionTotal.inc({ status });
  }

  setWorkerActiveUploads(count: number): void {
    this.workerActiveUploads.set(count);
  }

  setRowsPerSecond(rate: number): void {
    this.rowsPerSecond.set(rate);
  }

  setCircuitBreakerState(state: number): void {
    this.circuitBreakerState.set(state);
  }

  incrementCircuitBreakerTrips(): void {
    this.circuitBreakerTripsTotal.inc();
  }

  observeRateLimiterWait(seconds: number): void {
    this.rateLimiterWaitSeconds.observe(seconds);
  }

  observeGroupSize(size: number): void {
    this.groupSize.observe(size);
  }

  incrementRetry(): void {
    this.retryTotal.inc();
  }

  incrementRabbitMQPublish(routingKey: string, status: string): void {
    this.rabbitmqPublishTotal.inc({ routingKey, status });
  }

  observeRabbitMQPublishDuration(seconds: number): void {
    this.rabbitmqPublishDuration.observe(seconds);
  }
}
