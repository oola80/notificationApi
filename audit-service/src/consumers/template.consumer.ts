import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { BatchBufferService } from './batch-buffer.service.js';
import { AuditEventsRepository } from '../events/audit-events.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  QUEUE_AUDIT_TEMPLATE,
  CHANNEL_TEMPLATE,
} from '../rabbitmq/rabbitmq.constants.js';

const TEMPLATE_ACTION_MAP: Record<string, string> = {
  created: 'TEMPLATE_CREATED',
  updated: 'TEMPLATE_UPDATED',
  deleted: 'TEMPLATE_DELETED',
  rolledback: 'TEMPLATE_ROLLEDBACK',
};

@Injectable()
export class TemplateConsumer implements OnModuleInit {
  private readonly logger = new Logger(TemplateConsumer.name);

  constructor(
    private readonly batchBuffer: BatchBufferService,
    private readonly auditEventsRepo: AuditEventsRepository,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit(): void {
    this.batchBuffer.registerFlushHandler(
      QUEUE_AUDIT_TEMPLATE,
      async (records) => {
        await this.auditEventsRepo.insertMany(records);
      },
    );
  }

  @RabbitSubscribe({
    exchange: EXCHANGE_NOTIFICATIONS_STATUS,
    routingKey: 'template.#',
    queue: QUEUE_AUDIT_TEMPLATE,
    queueOptions: {
      durable: true,
      channel: CHANNEL_TEMPLATE,
    },
    createQueueIfNotExists: false,
  })
  async handle(message: Record<string, any>, amqpMsg: any): Promise<void | Nack> {
    try {
      if (!message || typeof message !== 'object') {
        this.logger.warn({ msg: 'Deserialization error: invalid message format', queue: QUEUE_AUDIT_TEMPLATE });
        this.metricsService.incrementDeserializationErrors(QUEUE_AUDIT_TEMPLATE);
        return;
      }

      const routingKey: string = amqpMsg?.fields?.routingKey ?? '';
      const action = routingKey.split('.').pop() ?? '';
      const eventType = TEMPLATE_ACTION_MAP[action] ?? `TEMPLATE_${action.toUpperCase()}`;
      const actor = 'template-service';

      const record = {
        notificationId: message.templateId ?? null,
        correlationId: message.correlationId ?? null,
        cycleId: null,
        eventType,
        actor,
        metadata: {
          templateId: message.templateId,
          slug: message.slug,
          version: message.version,
          action: message.action ?? action,
          userId: message.userId,
        },
        payloadSnapshot: message,
      };

      this.metricsService.incrementEventsIngested(eventType, actor);
      return await this.batchBuffer.add(QUEUE_AUDIT_TEMPLATE, record);
    } catch (error) {
      this.logger.warn({
        msg: 'Failed to process message',
        queue: QUEUE_AUDIT_TEMPLATE,
        error: (error as Error).message,
      });
      this.metricsService.incrementDeserializationErrors(QUEUE_AUDIT_TEMPLATE);
      return;
    }
  }
}
