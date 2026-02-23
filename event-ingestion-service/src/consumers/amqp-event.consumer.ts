import { Injectable, Logger } from '@nestjs/common';
import {
  RabbitSubscribe,
  Nack,
  AmqpConnection,
} from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import type { ConsumeMessage } from 'amqplib';
import { BaseEventConsumer } from './base-event.consumer.js';
import { EventProcessingService } from './event-processing.service.js';
import type { RabbitMqEventMessage } from '../rabbitmq/interfaces/rabbitmq-event-message.interface.js';
import {
  EXCHANGE_EVENTS_INCOMING,
  EXCHANGE_NOTIFICATIONS_DLQ,
  QUEUE_EVENTS_AMQP,
} from '../rabbitmq/rabbitmq.constants.js';

@Injectable()
export class AmqpEventConsumer extends BaseEventConsumer {
  protected readonly logger = new Logger(AmqpEventConsumer.name);
  protected readonly exchangeName = EXCHANGE_EVENTS_INCOMING;

  constructor(
    eventProcessingService: EventProcessingService,
    configService: ConfigService,
    amqpConnection: AmqpConnection,
  ) {
    super(eventProcessingService, configService, amqpConnection);
  }

  @RabbitSubscribe({
    exchange: EXCHANGE_EVENTS_INCOMING,
    routingKey: 'source.*.#',
    queue: QUEUE_EVENTS_AMQP,
    queueOptions: {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGE_NOTIFICATIONS_DLQ,
      },
    },
  })
  async handleAmqpEvent(
    message: Record<string, any>,
    amqpMsg: Record<string, any>,
  ): Promise<Nack | void> {
    try {
      const result = await this.handleMessage(
        message as RabbitMqEventMessage,
        amqpMsg as ConsumeMessage,
      );
      this.logger.log(
        `AMQP event processed: ${result.eventId} [${result.status}]`,
      );
    } catch (error) {
      return this.retryOrDlq(
        message as RabbitMqEventMessage,
        amqpMsg as ConsumeMessage,
        error,
        EXCHANGE_EVENTS_INCOMING,
      );
    }
  }
}
