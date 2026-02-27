import { Injectable, Logger, Optional } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { WebhookEventDto } from '../dto/webhook-event.dto.js';
import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  webhookRoutingKey,
} from './rabbitmq.constants.js';
import { MetricsService } from '../metrics/metrics.service.js';

@Injectable()
export class RabbitMQPublisherService {
  private readonly logger = new Logger(RabbitMQPublisherService.name);

  constructor(
    @Optional() private readonly amqpConnection: AmqpConnection | null,
    private readonly metricsService: MetricsService,
  ) {}

  publishWebhookEvent(event: WebhookEventDto): void {
    if (!this.amqpConnection) {
      this.logger.warn(
        'RabbitMQ not connected — skipping webhook event publish',
      );
      this.metricsService.incrementRabbitmqPublish(
        event.providerId,
        'failed',
      );
      return;
    }

    const routingKey = webhookRoutingKey(event.providerId);
    try {
      void this.amqpConnection.publish(
        EXCHANGE_NOTIFICATIONS_STATUS,
        routingKey,
        event,
        {
          persistent: true,
          contentType: 'application/json',
        },
      );
      this.metricsService.incrementRabbitmqPublish(
        event.providerId,
        'success',
      );
      this.logger.debug(
        `Published webhook event: ${event.providerId} ${event.eventType} → ${routingKey}`,
      );
    } catch (error) {
      this.metricsService.incrementRabbitmqPublish(
        event.providerId,
        'failed',
      );
      this.logger.warn(
        `Failed to publish webhook event for ${event.providerId}: ${(error as Error).message}`,
      );
    }
  }
}
