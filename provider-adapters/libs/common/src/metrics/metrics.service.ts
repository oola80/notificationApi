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

  readonly sendTotal: Counter;
  readonly sendDurationSeconds: Histogram;
  readonly sendErrorsTotal: Counter;
  readonly webhookReceivedTotal: Counter;
  readonly webhookVerificationFailuresTotal: Counter;
  readonly rabbitmqPublishTotal: Counter;
  readonly healthStatus: Gauge;

  constructor() {
    this.sendTotal = new Counter({
      name: 'adapter_send_total',
      help: 'Total send attempts',
      labelNames: ['providerId', 'channel', 'status'],
      registers: [this.registry],
    });

    this.sendDurationSeconds = new Histogram({
      name: 'adapter_send_duration_seconds',
      help: 'Send request duration in seconds',
      labelNames: ['providerId', 'channel'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.sendErrorsTotal = new Counter({
      name: 'adapter_send_errors_total',
      help: 'Total send errors',
      labelNames: ['providerId', 'channel', 'errorType'],
      registers: [this.registry],
    });

    this.webhookReceivedTotal = new Counter({
      name: 'adapter_webhook_received_total',
      help: 'Total webhook events received',
      labelNames: ['providerId', 'eventType'],
      registers: [this.registry],
    });

    this.webhookVerificationFailuresTotal = new Counter({
      name: 'adapter_webhook_verification_failures_total',
      help: 'Total webhook verification failures',
      labelNames: ['providerId'],
      registers: [this.registry],
    });

    this.rabbitmqPublishTotal = new Counter({
      name: 'adapter_rabbitmq_publish_total',
      help: 'Total RabbitMQ publish attempts',
      labelNames: ['providerId', 'status'],
      registers: [this.registry],
    });

    this.healthStatus = new Gauge({
      name: 'adapter_health_status',
      help: 'Adapter health status (1=ok, 0.5=degraded, 0=down)',
      labelNames: ['providerId'],
      registers: [this.registry],
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  incrementSend(
    providerId: string,
    channel: string,
    status: string,
  ): void {
    this.sendTotal.inc({ providerId, channel, status });
  }

  observeSendDuration(
    providerId: string,
    channel: string,
    seconds: number,
  ): void {
    this.sendDurationSeconds.observe({ providerId, channel }, seconds);
  }

  incrementSendErrors(
    providerId: string,
    channel: string,
    errorType: string,
  ): void {
    this.sendErrorsTotal.inc({ providerId, channel, errorType });
  }

  incrementWebhookReceived(
    providerId: string,
    eventType: string,
  ): void {
    this.webhookReceivedTotal.inc({ providerId, eventType });
  }

  incrementWebhookVerificationFailures(providerId: string): void {
    this.webhookVerificationFailuresTotal.inc({ providerId });
  }

  incrementRabbitmqPublish(providerId: string, status: string): void {
    this.rabbitmqPublishTotal.inc({ providerId, status });
  }

  setHealthStatus(providerId: string, value: number): void {
    this.healthStatus.set({ providerId }, value);
  }
}
