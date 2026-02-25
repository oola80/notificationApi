import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { RuleCacheService } from '../rules/rule-cache.service.js';
import {
  EXCHANGE_CONFIG_EVENTS,
  QUEUE_CONFIG_RULE_CACHE,
} from '../rabbitmq/rabbitmq.constants.js';

@Injectable()
export class RuleCacheInvalidationConsumer {
  private readonly logger = new Logger(RuleCacheInvalidationConsumer.name);

  constructor(private readonly ruleCacheService: RuleCacheService) {}

  @RabbitSubscribe({
    exchange: EXCHANGE_CONFIG_EVENTS,
    routingKey: 'config.rule.changed',
    queue: QUEUE_CONFIG_RULE_CACHE,
    queueOptions: { durable: true },
  })
  async handleRuleCacheInvalidation(message: {
    ruleId: string;
    timestamp: string;
    action: string;
  }): Promise<void> {
    try {
      if (!this.ruleCacheService.isEnabled()) {
        return;
      }

      this.logger.log(
        `Rule cache invalidation: ${message.action} ruleId=${message.ruleId}`,
      );
      await this.ruleCacheService.invalidateRule(
        message.ruleId,
        message.timestamp,
      );
    } catch (error) {
      this.logger.warn(
        `Rule cache invalidation failed for ruleId=${message.ruleId}: ${(error as Error).message}`,
      );
    }
  }
}
