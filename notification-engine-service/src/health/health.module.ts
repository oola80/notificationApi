import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { RabbitMQHealthIndicator } from './rabbitmq.health-indicator.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';
import { RulesModule } from '../rules/rules.module.js';

@Module({
  imports: [AppRabbitMQModule, RulesModule],
  controllers: [HealthController],
  providers: [RabbitMQHealthIndicator],
})
export class HealthModule {}
