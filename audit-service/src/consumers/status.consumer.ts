import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { BatchBufferService } from './batch-buffer.service.js';
import { AuditEventsRepository } from '../events/audit-events.repository.js';
import { DeliveryReceiptsRepository } from '../receipts/delivery-receipts.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  QUEUE_STATUS_UPDATES,
  CHANNEL_STATUS,
  extractProviderFromWebhookKey,
  isWebhookRoutingKey,
} from '../rabbitmq/rabbitmq.constants.js';

interface StatusBufferRecord {
  auditEvent: Record<string, any>;
  deliveryReceipt: Record<string, any> | null;
}

const DELIVERY_STATUS_MAP: Record<string, string> = {
  attempted: 'DELIVERY_ATTEMPTED',
  sent: 'DELIVERY_SENT',
  failed: 'DELIVERY_FAILED',
  retrying: 'DELIVERY_RETRYING',
};

const WEBHOOK_STATUS_MAP: Record<string, string> = {
  delivered: 'DELIVERED',
  bounced: 'BOUNCED',
  opened: 'OPENED',
  clicked: 'CLICKED',
  unsubscribed: 'UNSUBSCRIBED',
  spam_complaint: 'SPAM_COMPLAINT',
};

@Injectable()
export class StatusConsumer implements OnModuleInit {
  private readonly logger = new Logger(StatusConsumer.name);

  constructor(
    private readonly batchBuffer: BatchBufferService,
    private readonly auditEventsRepo: AuditEventsRepository,
    private readonly receiptsRepo: DeliveryReceiptsRepository,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit(): void {
    this.batchBuffer.registerFlushHandler(
      QUEUE_STATUS_UPDATES,
      async (records: StatusBufferRecord[]) => {
        const auditEvents = records.map((r) => r.auditEvent);
        const receipts = records
          .filter((r) => r.deliveryReceipt)
          .map((r) => r.deliveryReceipt!);

        await this.auditEventsRepo.insertMany(auditEvents);
        if (receipts.length > 0) {
          await this.receiptsRepo.insertMany(receipts);
        }
      },
    );
  }

  @RabbitSubscribe({
    exchange: EXCHANGE_NOTIFICATIONS_STATUS,
    routingKey: ['notification.status.#', 'adapter.webhook.#'],
    queue: QUEUE_STATUS_UPDATES,
    queueOptions: {
      durable: true,
      channel: CHANNEL_STATUS,
    },
    createQueueIfNotExists: false,
  })
  async handle(message: Record<string, any>, amqpMsg: any): Promise<void | Nack> {
    try {
      if (!message || typeof message !== 'object') {
        this.logger.warn({ msg: 'Deserialization error: invalid message format', queue: QUEUE_STATUS_UPDATES });
        this.metricsService.incrementDeserializationErrors(QUEUE_STATUS_UPDATES);
        return;
      }

      const routingKey: string = amqpMsg?.fields?.routingKey ?? '';

      if (isWebhookRoutingKey(routingKey)) {
        return await this.handleWebhookMessage(message, routingKey);
      } else {
        return await this.handleDeliveryStatusMessage(message, routingKey);
      }
    } catch (error) {
      this.logger.warn({
        msg: 'Failed to process message',
        queue: QUEUE_STATUS_UPDATES,
        error: (error as Error).message,
      });
      this.metricsService.incrementDeserializationErrors(QUEUE_STATUS_UPDATES);
      return;
    }
  }

  private async handleDeliveryStatusMessage(
    message: Record<string, any>,
    routingKey: string,
  ): Promise<void | Nack> {
    const statusKey = routingKey.split('.').pop() ?? '';
    const eventType = DELIVERY_STATUS_MAP[statusKey] ?? `DELIVERY_${statusKey.toUpperCase()}`;
    const actor = 'channel-router-service';

    const providerName = message.providerName ?? message.provider ?? null;
    const correlationId = message.metadata?.correlationId ?? message.correlationId ?? null;
    const cycleId = message.metadata?.cycleId ?? message.cycleId ?? null;
    const providerMessageId = message.providerMessageId ?? message.metadata?.providerMessageId ?? null;

    const auditEvent = {
      notificationId: message.notificationId ?? null,
      correlationId,
      cycleId,
      eventType,
      actor,
      metadata: {
        channel: message.channel,
        provider: providerName,
        fromStatus: message.fromStatus,
        toStatus: message.toStatus,
      },
      payloadSnapshot: message,
    };

    let deliveryReceipt: Record<string, any> | null = null;

    if (statusKey === 'sent' && providerMessageId) {
      deliveryReceipt = {
        notificationId: message.notificationId ?? null,
        correlationId,
        cycleId,
        channel: message.channel ?? 'unknown',
        provider: providerName ?? 'unknown',
        status: 'sent',
        providerMessageId,
        rawResponse: message.providerResponse ?? null,
      };

      this.metricsService.incrementReceiptsIngested(
        deliveryReceipt.channel,
        deliveryReceipt.provider,
        'sent',
      );
    }

    this.metricsService.incrementEventsIngested(eventType, actor);

    const record: StatusBufferRecord = { auditEvent, deliveryReceipt };
    return await this.batchBuffer.add(QUEUE_STATUS_UPDATES, record);
  }

  private async handleWebhookMessage(
    message: Record<string, any>,
    routingKey: string,
  ): Promise<void | Nack> {
    const actor = extractProviderFromWebhookKey(routingKey);
    const webhookStatus = (message.status ?? message.event ?? '').toLowerCase();
    const eventType = WEBHOOK_STATUS_MAP[webhookStatus] ?? webhookStatus.toUpperCase();

    const notificationId = message.notificationId ?? null;
    const isOrphaned = !notificationId;

    if (isOrphaned) {
      const provider = message.provider ?? actor;
      this.metricsService.incrementOrphanedReceipts(provider);
      this.logger.warn({
        msg: 'Orphaned webhook receipt',
        provider,
        providerMessageId: message.providerMessageId,
        status: webhookStatus,
      });
    }

    const auditEvent = {
      notificationId,
      correlationId: message.correlationId ?? null,
      cycleId: message.cycleId ?? null,
      eventType,
      actor,
      metadata: {
        channel: message.channel,
        provider: message.provider,
        providerMessageId: message.providerMessageId,
        webhookEvent: message.webhookEvent ?? message.event,
        isOrphaned,
      },
      payloadSnapshot: message,
    };

    const deliveryReceipt = {
      notificationId,
      correlationId: message.correlationId ?? null,
      cycleId: message.cycleId ?? null,
      channel: message.channel ?? 'unknown',
      provider: message.provider ?? actor.replace('adapter-', ''),
      status: webhookStatus || 'unknown',
      providerMessageId: message.providerMessageId ?? null,
      rawResponse: message.rawEvent ?? message,
    };

    this.metricsService.incrementEventsIngested(eventType, actor);
    this.metricsService.incrementReceiptsIngested(
      deliveryReceipt.channel,
      deliveryReceipt.provider,
      deliveryReceipt.status,
    );

    const record: StatusBufferRecord = { auditEvent, deliveryReceipt };
    return await this.batchBuffer.add(QUEUE_STATUS_UPDATES, record);
  }
}
