import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { OverrideCacheService } from '../overrides/override-cache.service.js';
import {
  EXCHANGE_CONFIG_EVENTS,
  QUEUE_CONFIG_OVERRIDE_CACHE,
} from '../rabbitmq/rabbitmq.constants.js';

@Injectable()
export class OverrideCacheInvalidationConsumer {
  private readonly logger = new Logger(OverrideCacheInvalidationConsumer.name);

  constructor(private readonly overrideCacheService: OverrideCacheService) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_CONFIG_EVENTS,
    routingKey: 'config.override.changed',
    queue: QUEUE_CONFIG_OVERRIDE_CACHE,
    queueOptions: { durable: true },
  })
  async handleOverrideCacheInvalidation(message: {
    eventType: string;
    action: string;
  }): Promise<void> {
    try {
      this.logger.log(
        `Override cache invalidation: ${message.action} eventType=${message.eventType}`,
      );
      await this.overrideCacheService.invalidate(message.eventType);
    } catch (error) {
      this.logger.warn(
        `Override cache invalidation failed for eventType=${message.eventType}: ${(error as Error).message}`,
      );
    }
  }
}
