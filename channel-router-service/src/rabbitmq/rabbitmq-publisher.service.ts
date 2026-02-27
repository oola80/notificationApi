import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_DLQ,
  statusRoutingKey,
  deliverRoutingKey,
  deliveryAttemptRoutingKey,
} from './rabbitmq.constants.js';
import {
  DeliveryStatusMessage,
  DeliveryAttemptMessage,
} from './interfaces/publisher.interfaces.js';

@Injectable()
export class RabbitMQPublisherService {
  private readonly logger = new Logger(RabbitMQPublisherService.name);

  constructor(private readonly amqpConnection: AmqpConnection) {}

  publishDeliveryStatus(payload: DeliveryStatusMessage): void {
    const routingKey = statusRoutingKey(payload.toStatus.toLowerCase());
    try {
      void this.amqpConnection.publish(
        EXCHANGE_NOTIFICATIONS_STATUS,
        routingKey,
        payload,
        {
          persistent: true,
          contentType: 'application/json',
        },
      );
      this.logger.debug(
        `Published delivery status: ${payload.notificationId} → ${payload.toStatus}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish delivery status for ${payload.notificationId}: ${(error as Error).message}`,
      );
    }
  }

  publishDeliveryAttempt(
    payload: DeliveryAttemptMessage,
    outcome: string,
  ): void {
    const routingKey = deliveryAttemptRoutingKey(outcome.toLowerCase());
    try {
      void this.amqpConnection.publish(
        EXCHANGE_NOTIFICATIONS_STATUS,
        routingKey,
        payload,
        {
          persistent: true,
          contentType: 'application/json',
        },
      );
      this.logger.debug(
        `Published delivery attempt: ${payload.notificationId} attempt=${payload.attemptNumber} outcome=${outcome}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish delivery attempt for ${payload.notificationId}: ${(error as Error).message}`,
      );
    }
  }

  publishToDlq(
    message: Record<string, any>,
    metadata: Record<string, any>,
  ): void {
    try {
      void this.amqpConnection.publish(
        EXCHANGE_NOTIFICATIONS_DLQ,
        '',
        {
          originalMessage: message,
          metadata,
          timestamp: new Date().toISOString(),
        },
        {
          persistent: true,
          contentType: 'application/json',
        },
      );
      this.logger.debug(
        `Published to DLQ: ${metadata.notificationId ?? 'unknown'}`,
      );
    } catch (error) {
      this.logger.warn(`Failed to publish to DLQ: ${(error as Error).message}`);
    }
  }

  publishFallbackDispatch(message: Record<string, any>): void {
    const routingKey = deliverRoutingKey(
      (message.priority as string) ?? 'normal',
      message.channel as string,
    );
    try {
      void this.amqpConnection.publish(
        EXCHANGE_NOTIFICATIONS_DELIVER,
        routingKey,
        message,
        {
          persistent: true,
          contentType: 'application/json',
          headers: {
            'x-channel': message.channel as string,
            'x-priority': (message.priority as string) ?? 'normal',
            'x-fallback': 'true',
          },
        },
      );
      this.logger.debug(
        `Published fallback dispatch: ${message.notificationId} → ${routingKey}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish fallback dispatch for ${message.notificationId}: ${(error as Error).message}`,
      );
    }
  }

  async republishForRetry(
    exchange: string,
    routingKey: string,
    message: Record<string, any>,
    headers?: Record<string, any>,
  ): Promise<void> {
    await this.amqpConnection.publish(exchange, routingKey, message, {
      persistent: true,
      contentType: 'application/json',
      headers: {
        ...headers,
        'x-retry-at': new Date().toISOString(),
      },
    });
    this.logger.debug(
      `Republished for retry: ${message.notificationId} → ${routingKey}`,
    );
  }
}
