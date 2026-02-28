import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { BatchBufferService } from './batch-buffer.service.js';
import { AuditEventsRepository } from '../events/audit-events.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  EXCHANGE_EVENTS_NORMALIZED,
  QUEUE_AUDIT_EVENTS,
  CHANNEL_EVENTS,
} from '../rabbitmq/rabbitmq.constants.js';

const EVENT_TYPE_MAP: Record<string, string> = {
  validation_failed: 'EVENT_VALIDATION_FAILED',
  duplicate_detected: 'EVENT_DUPLICATE_DETECTED',
  ingested: 'EVENT_INGESTED',
  normalized: 'EVENT_NORMALIZED',
};

@Injectable()
export class EventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(EventsConsumer.name);

  constructor(
    private readonly batchBuffer: BatchBufferService,
    private readonly auditEventsRepo: AuditEventsRepository,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit(): void {
    this.batchBuffer.registerFlushHandler(
      QUEUE_AUDIT_EVENTS,
      async (records) => {
        await this.auditEventsRepo.insertMany(records);
      },
    );
  }

  @RabbitSubscribe({
    exchange: EXCHANGE_EVENTS_NORMALIZED,
    routingKey: 'event.#',
    queue: QUEUE_AUDIT_EVENTS,
    queueOptions: {
      durable: true,
      channel: CHANNEL_EVENTS,
    },
    createQueueIfNotExists: false,
  })
  async handle(message: Record<string, any>, amqpMsg: any): Promise<void | Nack> {
    try {
      if (!message || typeof message !== 'object') {
        this.logger.warn({ msg: 'Deserialization error: invalid message format', queue: QUEUE_AUDIT_EVENTS });
        this.metricsService.incrementDeserializationErrors(QUEUE_AUDIT_EVENTS);
        return;
      }

      const eventType = this.mapEventType(message);
      const actor = 'event-ingestion-service';

      const record = {
        notificationId: message.notificationId ?? message.eventId ?? null,
        correlationId: message.correlationId ?? null,
        cycleId: message.cycleId ?? null,
        eventType,
        actor,
        metadata: {
          sourceId: message.sourceId,
          eventType: message.eventType,
          priority: message.priority,
        },
        payloadSnapshot: message.normalizedPayload ?? message.rawPayload ?? null,
      };

      this.metricsService.incrementEventsIngested(eventType, actor);
      return await this.batchBuffer.add(QUEUE_AUDIT_EVENTS, record);
    } catch (error) {
      this.logger.warn({
        msg: 'Failed to process message',
        queue: QUEUE_AUDIT_EVENTS,
        error: (error as Error).message,
      });
      this.metricsService.incrementDeserializationErrors(QUEUE_AUDIT_EVENTS);
      return;
    }
  }

  private mapEventType(message: Record<string, any>): string {
    if (message.auditEventType && EVENT_TYPE_MAP[message.auditEventType]) {
      return EVENT_TYPE_MAP[message.auditEventType];
    }
    if (message.status && EVENT_TYPE_MAP[message.status]) {
      return EVENT_TYPE_MAP[message.status];
    }
    if (message.validationErrors) return 'EVENT_VALIDATION_FAILED';
    if (message.duplicateOf || message.isDuplicate) return 'EVENT_DUPLICATE_DETECTED';
    if (message.normalizedPayload) return 'EVENT_NORMALIZED';
    return 'EVENT_INGESTED';
  }
}
