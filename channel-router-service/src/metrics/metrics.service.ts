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
  readonly deliveryTotal: Counter;
  readonly adapterUnavailableTotal: Counter;
  readonly retryTotal: Counter;
  readonly circuitBreakerTripsTotal: Counter;
  readonly fallbackTriggeredTotal: Counter;
  readonly mediaFailureTotal: Counter;
  readonly dlqTotal: Counter;

  // Histograms
  readonly deliveryDurationMs: Histogram;
  readonly adapterCallDurationMs: Histogram;
  readonly rateLimitWaitMs: Histogram;
  readonly mediaDownloadDurationMs: Histogram;

  // Gauges
  readonly circuitBreakerState: Gauge;
  readonly queueDepth: Gauge;

  constructor() {
    this.deliveryTotal = new Counter({
      name: 'channel_router_delivery_total',
      help: 'Total delivery attempts',
      labelNames: ['channel', 'adapter', 'status'],
      registers: [this.registry],
    });

    this.adapterUnavailableTotal = new Counter({
      name: 'channel_router_adapter_unavailable_total',
      help: 'Adapter service unavailable/timeout events',
      labelNames: ['adapter'],
      registers: [this.registry],
    });

    this.retryTotal = new Counter({
      name: 'channel_router_retry_total',
      help: 'Total retries triggered',
      labelNames: ['channel', 'adapter', 'attempt_number'],
      registers: [this.registry],
    });

    this.circuitBreakerTripsTotal = new Counter({
      name: 'channel_router_circuit_breaker_trips_total',
      help: 'Circuit breaker trip count',
      labelNames: ['adapter'],
      registers: [this.registry],
    });

    this.fallbackTriggeredTotal = new Counter({
      name: 'channel_router_fallback_triggered_total',
      help: 'Fallback channel activations',
      labelNames: ['primary_channel', 'fallback_channel'],
      registers: [this.registry],
    });

    this.mediaFailureTotal = new Counter({
      name: 'channel_router_media_failure_total',
      help: 'Media download/validation failures',
      labelNames: ['channel', 'reason'],
      registers: [this.registry],
    });

    this.dlqTotal = new Counter({
      name: 'channel_router_dlq_total',
      help: 'Messages sent to dead letter queue',
      labelNames: ['channel', 'adapter'],
      registers: [this.registry],
    });

    this.deliveryDurationMs = new Histogram({
      name: 'channel_router_delivery_duration_ms',
      help: 'Total delivery time including adapter call',
      labelNames: ['channel', 'adapter'],
      buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
      registers: [this.registry],
    });

    this.adapterCallDurationMs = new Histogram({
      name: 'channel_router_adapter_call_duration_ms',
      help: 'HTTP call round-trip time to adapter service',
      labelNames: ['adapter'],
      buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
      registers: [this.registry],
    });

    this.rateLimitWaitMs = new Histogram({
      name: 'channel_router_rate_limit_wait_ms',
      help: 'Time spent waiting for rate limit tokens',
      labelNames: ['adapter'],
      buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
      registers: [this.registry],
    });

    this.mediaDownloadDurationMs = new Histogram({
      name: 'channel_router_media_download_duration_ms',
      help: 'Media asset download time',
      labelNames: ['channel'],
      buckets: [100, 250, 500, 1000, 2500, 5000, 10000],
      registers: [this.registry],
    });

    this.circuitBreakerState = new Gauge({
      name: 'channel_router_circuit_breaker_state',
      help: 'Circuit breaker state per adapter (0=CLOSED, 1=HALF_OPEN, 2=OPEN)',
      labelNames: ['adapter'],
      registers: [this.registry],
    });

    this.queueDepth = new Gauge({
      name: 'channel_router_queue_depth',
      help: 'Current message count in delivery queues',
      labelNames: ['queue'],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  incrementDelivery(channel: string, adapter: string, status: string): void {
    this.deliveryTotal.inc({ channel, adapter, status });
  }

  incrementAdapterUnavailable(adapter: string): void {
    this.adapterUnavailableTotal.inc({ adapter });
  }

  incrementRetry(
    channel: string,
    adapter: string,
    attemptNumber: string,
  ): void {
    this.retryTotal.inc({ channel, adapter, attempt_number: attemptNumber });
  }

  incrementCircuitBreakerTrips(adapter: string): void {
    this.circuitBreakerTripsTotal.inc({ adapter });
  }

  incrementFallbackTriggered(
    primaryChannel: string,
    fallbackChannel: string,
  ): void {
    this.fallbackTriggeredTotal.inc({
      primary_channel: primaryChannel,
      fallback_channel: fallbackChannel,
    });
  }

  incrementMediaFailure(channel: string, reason: string): void {
    this.mediaFailureTotal.inc({ channel, reason });
  }

  incrementDlq(channel: string, adapter: string): void {
    this.dlqTotal.inc({ channel, adapter });
  }

  observeDeliveryDuration(channel: string, adapter: string, ms: number): void {
    this.deliveryDurationMs.observe({ channel, adapter }, ms);
  }

  observeAdapterCallDuration(adapter: string, ms: number): void {
    this.adapterCallDurationMs.observe({ adapter }, ms);
  }

  observeRateLimitWait(adapter: string, ms: number): void {
    this.rateLimitWaitMs.observe({ adapter }, ms);
  }

  observeMediaDownloadDuration(channel: string, ms: number): void {
    this.mediaDownloadDurationMs.observe({ channel }, ms);
  }

  setCircuitBreakerState(adapter: string, state: number): void {
    this.circuitBreakerState.set({ adapter }, state);
  }

  setQueueDepth(queue: string, depth: number): void {
    this.queueDepth.set({ queue }, depth);
  }
}
