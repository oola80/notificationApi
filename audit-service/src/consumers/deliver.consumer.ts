import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { BatchBufferService } from './batch-buffer.service.js';
import { AuditEventsRepository } from '../events/audit-events.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  EXCHANGE_NOTIFICATIONS_DELIVER,
  QUEUE_AUDIT_DELIVER,
  CHANNEL_DELIVER,
} from '../rabbitmq/rabbitmq.constants.js';

@Injectable()
export class DeliverConsumer implements OnModuleInit {
  private readonly logger = new Logger(DeliverConsumer.name);

  constructor(
    private readonly batchBuffer: BatchBufferService,
    private readonly auditEventsRepo: AuditEventsRepository,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit(): void {
    this.batchBuffer.registerFlushHandler(
      QUEUE_AUDIT_DELIVER,
      async (records) => {
        await this.auditEventsRepo.insertMany(records);
      },
    );
  }

  @RabbitSubscribe({
    exchange: EXCHANGE_NOTIFICATIONS_DELIVER,
    routingKey: 'notification.deliver.#',
    queue: QUEUE_AUDIT_DELIVER,
    queueOptions: {
      durable: true,
      channel: CHANNEL_DELIVER,
    },
    createQueueIfNotExists: false,
  })
  async handle(message: Record<string, any>, amqpMsg: any): Promise<void | Nack> {
    try {
      if (!message || typeof message !== 'object') {
        this.logger.warn({ msg: 'Deserialization error: invalid message format', queue: QUEUE_AUDIT_DELIVER });
        this.metricsService.incrementDeserializationErrors(QUEUE_AUDIT_DELIVER);
        return;
      }

      const actor = 'notification-engine-service';
      const eventType = 'DELIVERY_DISPATCHED';

      const record = {
        notificationId: message.notificationId ?? null,
        correlationId: message.correlationId ?? null,
        cycleId: message.cycleId ?? null,
        eventType,
        actor,
        metadata: {
          channel: message.channel,
          priority: message.priority,
          recipientCount: message.recipients?.length,
        },
        payloadSnapshot: message,
      };

      this.metricsService.incrementEventsIngested(eventType, actor);
      return await this.batchBuffer.add(QUEUE_AUDIT_DELIVER, record);
    } catch (error) {
      this.logger.warn({
        msg: 'Failed to process message',
        queue: QUEUE_AUDIT_DELIVER,
        error: (error as Error).message,
      });
      this.metricsService.incrementDeserializationErrors(QUEUE_AUDIT_DELIVER);
      return;
    }
  }
}
