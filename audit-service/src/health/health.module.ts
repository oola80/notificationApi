import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { RabbitMQHealthIndicator } from './indicators/rabbitmq-health.indicator.js';
import { DlqPendingHealthIndicator } from './indicators/dlq-pending-health.indicator.js';
import { ConsumerHealthIndicator } from './indicators/consumer-health.indicator.js';
import { DlqModule } from '../dlq/dlq.module.js';

@Module({
  imports: [DlqModule],
  controllers: [HealthController],
  providers: [
    RabbitMQHealthIndicator,
    DlqPendingHealthIndicator,
    ConsumerHealthIndicator,
  ],
})
export class HealthModule {}
