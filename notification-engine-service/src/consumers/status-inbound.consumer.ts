import { Injectable, Logger } from '@nestjs/common';
import {
  RabbitSubscribe,
  Nack,
  AmqpConnection,
} from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { BaseEventConsumer } from './base-event.consumer.js';
import { NotificationLifecycleService } from '../notifications/notification-lifecycle.service.js';
import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_NOTIFICATIONS_DLQ,
  QUEUE_ENGINE_STATUS_INBOUND,
} from '../rabbitmq/rabbitmq.constants.js';

@Injectable()
export class StatusInboundConsumer extends BaseEventConsumer {
  protected readonly logger = new Logger(StatusInboundConsumer.name);
  protected readonly exchangeName = EXCHANGE_NOTIFICATIONS_STATUS;

  constructor(
    configService: ConfigService,
    amqpConnection: AmqpConnection,
    private readonly lifecycleService: NotificationLifecycleService,
  ) {
    super(configService, amqpConnection);
  }

  @RabbitSubscribe({
    exchange: EXCHANGE_NOTIFICATIONS_STATUS,
    routingKey: ['notification.status.delivered', 'notification.status.failed'],
    queue: QUEUE_ENGINE_STATUS_INBOUND,
    queueOptions: {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': EXCHANGE_NOTIFICATIONS_DLQ,
      },
    },
  })
  async handleStatusInbound(
    message: {
      notificationId: string;
      toStatus: string;
      fromStatus?: string;
      metadata?: Record<string, any>;
    },
    amqpMsg: any,
  ): Promise<void | Nack> {
    const routingKey = amqpMsg?.fields?.routingKey ?? '';

    this.logger.log({
      msg: 'Inbound status update',
      notificationId: message.notificationId,
      fromStatus: message.fromStatus ?? null,
      toStatus: message.toStatus,
      queue: QUEUE_ENGINE_STATUS_INBOUND,
      routingKey,
    });

    try {
      await this.lifecycleService.transition(
        message.notificationId,
        message.toStatus,
        message.metadata,
      );
    } catch (error) {
      return this.retryOrDlq(message, amqpMsg, error as Error);
    }
  }
}
