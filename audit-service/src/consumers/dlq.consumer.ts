import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { BatchBufferService } from './batch-buffer.service.js';
import { AuditEventsRepository } from '../events/audit-events.repository.js';
import { DlqEntriesRepository } from '../dlq/dlq-entries.repository.js';
import { DlqEntryStatus } from '../dlq/entities/dlq-entry.entity.js';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  EXCHANGE_NOTIFICATIONS_DLQ,
  QUEUE_AUDIT_DLQ,
  CHANNEL_DLQ,
} from '../rabbitmq/rabbitmq.constants.js';

interface DlqBufferRecord {
  auditEvent: Record<string, any>;
  dlqEntry: Record<string, any>;
}

@Injectable()
export class DlqConsumer implements OnModuleInit {
  private readonly logger = new Logger(DlqConsumer.name);

  constructor(
    private readonly batchBuffer: BatchBufferService,
    private readonly auditEventsRepo: AuditEventsRepository,
    private readonly dlqEntriesRepo: DlqEntriesRepository,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit(): void {
    this.batchBuffer.registerFlushHandler(
      QUEUE_AUDIT_DLQ,
      async (records: DlqBufferRecord[]) => {
        const auditEvents = records.map((r) => r.auditEvent);
        const dlqEntries = records.map((r) => r.dlqEntry);

        await this.auditEventsRepo.insertMany(auditEvents);
        await this.dlqEntriesRepo.insertMany(dlqEntries);
      },
    );
  }

  @RabbitSubscribe({
    exchange: EXCHANGE_NOTIFICATIONS_DLQ,
    routingKey: '',
    queue: QUEUE_AUDIT_DLQ,
    queueOptions: {
      durable: true,
      channel: CHANNEL_DLQ,
    },
    createQueueIfNotExists: false,
  })
  async handle(message: Record<string, any>, amqpMsg: any): Promise<void | Nack> {
    try {
      if (!message || typeof message !== 'object') {
        this.logger.warn({ msg: 'Deserialization error: invalid message format', queue: QUEUE_AUDIT_DLQ });
        this.metricsService.incrementDeserializationErrors(QUEUE_AUDIT_DLQ);
        return;
      }

      const xDeath = this.extractXDeath(amqpMsg);

      const dlqEntry = {
        originalQueue: xDeath.queue,
        originalExchange: xDeath.exchange,
        originalRoutingKey: xDeath.routingKey,
        rejectionReason: xDeath.reason,
        retryCount: xDeath.count,
        payload: message,
        xDeathHeaders: xDeath.raw,
        status: DlqEntryStatus.PENDING,
      };

      const notificationId = message.notificationId ?? null;

      const auditEvent = {
        notificationId,
        correlationId: message.correlationId ?? null,
        cycleId: message.cycleId ?? null,
        eventType: 'DLQ_CAPTURED',
        actor: 'audit-service',
        metadata: {
          originalQueue: xDeath.queue,
          originalExchange: xDeath.exchange,
          originalRoutingKey: xDeath.routingKey,
          rejectionReason: xDeath.reason,
          retryCount: xDeath.count,
        },
        payloadSnapshot: message,
      };

      this.metricsService.incrementDlqEntries(xDeath.queue);
      this.metricsService.incrementEventsIngested('DLQ_CAPTURED', 'audit-service');

      const record: DlqBufferRecord = { auditEvent, dlqEntry };
      return await this.batchBuffer.add(QUEUE_AUDIT_DLQ, record);
    } catch (error) {
      this.logger.warn({
        msg: 'Failed to process DLQ message',
        queue: QUEUE_AUDIT_DLQ,
        error: (error as Error).message,
      });
      this.metricsService.incrementDeserializationErrors(QUEUE_AUDIT_DLQ);
      return;
    }
  }

  private extractXDeath(amqpMsg: any): {
    queue: string;
    exchange: string;
    routingKey: string | null;
    reason: string | null;
    count: number;
    raw: Record<string, any> | null;
  } {
    const headers = amqpMsg?.properties?.headers;
    const xDeath = headers?.['x-death'];

    if (Array.isArray(xDeath) && xDeath.length > 0) {
      const first = xDeath[0];
      return {
        queue: first.queue ?? 'unknown',
        exchange: first.exchange ?? 'unknown',
        routingKey: first['routing-keys']?.[0] ?? null,
        reason: first.reason ?? null,
        count: first.count ?? 0,
        raw: xDeath,
      };
    }

    return {
      queue: headers?.['x-first-death-queue'] ?? 'unknown',
      exchange: headers?.['x-first-death-exchange'] ?? 'unknown',
      routingKey: headers?.['x-first-death-reason'] ?? null,
      reason: null,
      count: 0,
      raw: null,
    };
  }
}
