import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import {
  EXCHANGE_CONFIG_EVENTS,
  QUEUE_CONFIG_MAPPING_CACHE,
} from '../rabbitmq/rabbitmq.constants.js';
import { MappingCacheService } from './mapping-cache.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { MappingCacheInvalidationMessage } from './interfaces/mapping-cache-message.interface.js';

@Injectable()
export class MappingCacheConsumer {
  private readonly logger = new Logger(MappingCacheConsumer.name);

  constructor(
    private readonly mappingCacheService: MappingCacheService,
    private readonly metricsService: MetricsService,
  ) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_CONFIG_EVENTS,
    routingKey: 'config.mapping.changed',
    queue: QUEUE_CONFIG_MAPPING_CACHE,
    queueOptions: {
      durable: true,
    },
  })
  async handleMappingChanged(
    message: MappingCacheInvalidationMessage,
  ): Promise<void> {
    this.logger.log(
      `Received mapping cache invalidation: id=${message.id} version=${message.version}`,
    );

    try {
      await this.mappingCacheService.invalidateMapping(
        message.id,
        message.version,
      );
      this.metricsService.incrementCacheInvalidation();
    } catch (error) {
      this.logger.error(
        `Failed to invalidate mapping ${message.id}: ${(error as Error).message}`,
      );
    }
  }
}
