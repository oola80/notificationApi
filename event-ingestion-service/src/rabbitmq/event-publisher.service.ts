import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import {
  EXCHANGE_EVENTS_NORMALIZED,
  normalizedRoutingKey,
} from './rabbitmq.constants.js';
import { NormalizedEventMessage } from './interfaces/rabbitmq-event-message.interface.js';
import { createErrorResponse } from '../common/errors.js';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(private readonly amqpConnection: AmqpConnection) {}

  async publishNormalized(
    eventId: string,
    correlationId: string,
    sourceId: string,
    cycleId: string,
    eventType: string,
    priority: string,
    normalizedPayload: Record<string, any>,
  ): Promise<void> {
    const routingKey = normalizedRoutingKey(priority, eventType);

    const message: NormalizedEventMessage = {
      eventId,
      correlationId,
      sourceId,
      cycleId,
      eventType,
      priority,
      normalizedPayload,
      publishedAt: new Date().toISOString(),
    };

    try {
      await this.amqpConnection.publish(
        EXCHANGE_EVENTS_NORMALIZED,
        routingKey,
        message,
        {
          persistent: true,
          contentType: 'application/json',
          messageId: eventId,
          correlationId,
          headers: {
            'x-source-id': sourceId,
            'x-event-type': eventType,
            'x-priority': priority,
          },
        },
      );

      this.logger.log(
        `Published event ${eventId} to ${EXCHANGE_EVENTS_NORMALIZED} [${routingKey}]`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish event ${eventId}: ${(error as Error).message}`,
      );
      throw createErrorResponse(
        'EIS-018',
        `Failed to publish event ${eventId}: ${(error as Error).message}`,
      );
    }
  }
}
