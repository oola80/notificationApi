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
  readonly eventsConsumedTotal: Counter;
  readonly rulesMatchedTotal: Counter;
  readonly notificationsCreatedTotal: Counter;
  readonly notificationsSuppressedTotal: Counter;
  readonly notificationsDispatchedTotal: Counter;
  readonly notificationsFailedTotal: Counter;
  readonly templateRenderTotal: Counter;

  // Histograms
  readonly eventProcessingDuration: Histogram;
  readonly templateRenderDuration: Histogram;
  readonly ruleEvaluationDuration: Histogram;

  // Gauges
  readonly ruleCacheSize: Gauge;
  readonly preferenceCacheSize: Gauge;
  readonly overrideCacheSize: Gauge;
  readonly templateServiceCircuitState: Gauge;

  constructor() {
    this.eventsConsumedTotal = new Counter({
      name: 'nes_events_consumed_total',
      help: 'Total events consumed from queues',
      labelNames: ['priority', 'eventType'],
      registers: [this.registry],
    });

    this.rulesMatchedTotal = new Counter({
      name: 'nes_rules_matched_total',
      help: 'Total rules matched during evaluation',
      labelNames: ['eventType', 'ruleId'],
      registers: [this.registry],
    });

    this.notificationsCreatedTotal = new Counter({
      name: 'nes_notifications_created_total',
      help: 'Total notifications created',
      labelNames: ['channel', 'priority'],
      registers: [this.registry],
    });

    this.notificationsSuppressedTotal = new Counter({
      name: 'nes_notifications_suppressed_total',
      help: 'Total notifications suppressed',
      labelNames: ['mode', 'ruleId'],
      registers: [this.registry],
    });

    this.notificationsDispatchedTotal = new Counter({
      name: 'nes_notifications_dispatched_total',
      help: 'Total notifications dispatched to delivery',
      labelNames: ['channel', 'priority'],
      registers: [this.registry],
    });

    this.notificationsFailedTotal = new Counter({
      name: 'nes_notifications_failed_total',
      help: 'Total notifications that failed',
      labelNames: ['channel', 'reason'],
      registers: [this.registry],
    });

    this.templateRenderTotal = new Counter({
      name: 'nes_template_render_total',
      help: 'Total template render attempts',
      labelNames: ['channel', 'status'],
      registers: [this.registry],
    });

    this.eventProcessingDuration = new Histogram({
      name: 'nes_event_processing_duration_seconds',
      help: 'Event processing duration in seconds',
      labelNames: ['priority'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });

    this.templateRenderDuration = new Histogram({
      name: 'nes_template_render_duration_seconds',
      help: 'Template render duration in seconds',
      labelNames: ['channel'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });

    this.ruleEvaluationDuration = new Histogram({
      name: 'nes_rule_evaluation_duration_seconds',
      help: 'Rule evaluation duration in seconds',
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1],
      registers: [this.registry],
    });

    this.ruleCacheSize = new Gauge({
      name: 'nes_rule_cache_size',
      help: 'Number of event types in rule cache',
      registers: [this.registry],
    });

    this.preferenceCacheSize = new Gauge({
      name: 'nes_preference_cache_size',
      help: 'Number of entries in preference cache',
      registers: [this.registry],
    });

    this.overrideCacheSize = new Gauge({
      name: 'nes_override_cache_size',
      help: 'Number of event types in override cache',
      registers: [this.registry],
    });

    this.templateServiceCircuitState = new Gauge({
      name: 'nes_template_service_circuit_state',
      help: 'Template service circuit breaker state (0=closed, 1=open, 2=half-open)',
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  incrementEventsConsumed(priority: string, eventType: string): void {
    this.eventsConsumedTotal.inc({ priority, eventType });
  }

  incrementRulesMatched(eventType: string, ruleId: string): void {
    this.rulesMatchedTotal.inc({ eventType, ruleId });
  }

  incrementNotificationsCreated(channel: string, priority: string): void {
    this.notificationsCreatedTotal.inc({ channel, priority });
  }

  incrementSuppressed(mode: string, ruleId: string): void {
    this.notificationsSuppressedTotal.inc({ mode, ruleId });
  }

  incrementDispatched(channel: string, priority: string): void {
    this.notificationsDispatchedTotal.inc({ channel, priority });
  }

  incrementFailed(channel: string, reason: string): void {
    this.notificationsFailedTotal.inc({ channel, reason });
  }

  incrementTemplateRender(channel: string, status: string): void {
    this.templateRenderTotal.inc({ channel, status });
  }

  observeEventProcessing(priority: string, seconds: number): void {
    this.eventProcessingDuration.observe({ priority }, seconds);
  }

  observeTemplateRender(channel: string, seconds: number): void {
    this.templateRenderDuration.observe({ channel }, seconds);
  }

  observeRuleEvaluation(seconds: number): void {
    this.ruleEvaluationDuration.observe(seconds);
  }

  setRuleCacheSize(n: number): void {
    this.ruleCacheSize.set(n);
  }

  setPreferenceCacheSize(n: number): void {
    this.preferenceCacheSize.set(n);
  }

  setOverrideCacheSize(n: number): void {
    this.overrideCacheSize.set(n);
  }

  setTemplateServiceCircuitState(state: number): void {
    this.templateServiceCircuitState.set(state);
  }
}
