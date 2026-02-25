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
  QUEUE_ENGINE_EVENTS_NORMAL,
} from '../rabbitmq/rabbitmq.constants.js';
import type { NormalizedEventMessage } from '../rabbitmq/interfaces/normalized-event-message.interface.js';

@Injectable()
export class NormalEventConsumer extends BaseEventConsumer {
  protected readonly logger = new Logger(NormalEventConsumer.name);
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
    routingKey: 'event.normal.#',
    queue: QUEUE_ENGINE_EVENTS_NORMAL,
    queueOptions: {
      durable: true,
      channel: 'channel-normal',
      arguments: {
        'x-dead-letter-exchange': EXCHANGE_NOTIFICATIONS_DLQ,
      },
    },
    createQueueIfNotExists: false,
  })
  async handleNormalEvent(message: any, amqpMsg: any): Promise<void | Nack> {
    const event = message as NormalizedEventMessage;
    const retryCount = this.getRetryCount(amqpMsg);
    const routingKey = amqpMsg?.fields?.routingKey ?? '';

    this.logger.log({
      msg: 'Processing normal event',
      eventId: event.eventId,
      eventType: event.eventType,
      queue: QUEUE_ENGINE_EVENTS_NORMAL,
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
