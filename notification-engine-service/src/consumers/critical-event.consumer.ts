import { Injectable, Logger } from '@nestjs/common';
import {
  RabbitSubscribe,
  Nack,
  AmqpConnection,
} from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { BaseEventConsumer } from './base-event.consumer.js';
import { EventProcessingPipelineService } from './event-processing-pipeline.service.js';
import {
  EXCHANGE_EVENTS_NORMALIZED,
  EXCHANGE_NOTIFICATIONS_DLQ,
  QUEUE_ENGINE_EVENTS_CRITICAL,
} from '../rabbitmq/rabbitmq.constants.js';
import type { NormalizedEventMessage } from '../rabbitmq/interfaces/normalized-event-message.interface.js';

@Injectable()
export class CriticalEventConsumer extends BaseEventConsumer {
  protected readonly logger = new Logger(CriticalEventConsumer.name);
  protected readonly exchangeName = EXCHANGE_EVENTS_NORMALIZED;

  constructor(
    configService: ConfigService,
    amqpConnection: AmqpConnection,
    private readonly pipeline: EventProcessingPipelineService,
  ) {
    super(configService, amqpConnection);
  }

  @RabbitSubscribe({
    exchange: EXCHANGE_EVENTS_NORMALIZED,
    routingKey: 'event.critical.#',
    queue: QUEUE_ENGINE_EVENTS_CRITICAL,
    queueOptions: {
      durable: true,
      channel: 'channel-critical',
      arguments: {
        'x-dead-letter-exchange': EXCHANGE_NOTIFICATIONS_DLQ,
      },
    },
    createQueueIfNotExists: false,
  })
  async handleCriticalEvent(message: any, amqpMsg: any): Promise<void | Nack> {
    const event = message as NormalizedEventMessage;
    const retryCount = this.getRetryCount(amqpMsg);
    const routingKey = amqpMsg?.fields?.routingKey ?? '';

    this.logger.log({
      msg: 'Processing critical event',
      eventId: event.eventId,
      eventType: event.eventType,
      queue: QUEUE_ENGINE_EVENTS_CRITICAL,
      routingKey,
      retryCount,
    });

    try {
      await this.pipeline.processEvent(event);
    } catch (error) {
      return this.retryOrDlq(message, amqpMsg, error as Error);
    }
  }
}
