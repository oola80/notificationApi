import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { DeliverMessage } from './interfaces/deliver-message.interface.js';
import {
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_CONFIG_EVENTS,
  deliverRoutingKey,
  statusRoutingKey,
} from './rabbitmq.constants.js';
import { createErrorResponse } from '../common/errors.js';

@Injectable()
export class NotificationPublisherService {
  private readonly logger = new Logger(NotificationPublisherService.name);

  constructor(private readonly amqpConnection: AmqpConnection) {}

  async publishToDeliver(message: DeliverMessage): Promise<void> {
    const routingKey = deliverRoutingKey(message.priority, message.channel);

    try {
      await this.amqpConnection.publish(
        EXCHANGE_NOTIFICATIONS_DELIVER,
        routingKey,
        message,
        {
          persistent: true,
          contentType: 'application/json',
          messageId: message.notificationId,
          correlationId: message.metadata?.correlationId,
          headers: {
            'x-channel': message.channel,
            'x-priority': message.priority,
            'x-event-type': message.metadata?.eventType,
          },
        },
      );
      this.logger.debug(
        `Published deliver message: ${message.notificationId} → ${routingKey}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish deliver message: ${message.notificationId}`,
        (error as Error).stack,
      );
      throw createErrorResponse('NES-016');
    }
  }

  publishStatus(
    notificationId: string,
    fromStatus: string,
    toStatus: string,
    channel: string,
    metadata?: Record<string, any>,
  ): void {
    const routingKey = statusRoutingKey(toStatus.toLowerCase());
    const payload = {
      notificationId,
      fromStatus,
      toStatus,
      channel,
      metadata,
      timestamp: new Date().toISOString(),
    };

    try {
      this.amqpConnection.publish(
        EXCHANGE_NOTIFICATIONS_STATUS,
        routingKey,
        payload,
        {
          persistent: true,
          contentType: 'application/json',
        },
      );
      this.logger.debug(
        `Published status: ${notificationId} ${fromStatus}→${toStatus}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish status for ${notificationId}: ${(error as Error).message}`,
      );
    }
  }

  publishConfigEvent(routingKey: string, payload: Record<string, any>): void {
    try {
      this.amqpConnection.publish(EXCHANGE_CONFIG_EVENTS, routingKey, payload, {
        persistent: true,
        contentType: 'application/json',
      });
      this.logger.debug(`Published config event: ${routingKey}`);
    } catch (error) {
      this.logger.warn(
        `Failed to publish config event ${routingKey}: ${(error as Error).message}`,
      );
    }
  }
}
