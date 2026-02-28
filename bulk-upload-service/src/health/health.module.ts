import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { RabbitMQHealthIndicator } from './indicators/rabbitmq-health.indicator.js';
import { EventIngestionHealthIndicator } from './indicators/event-ingestion-health.indicator.js';
import { DiskSpaceHealthIndicator } from './indicators/disk-space-health.indicator.js';

@Module({
  controllers: [HealthController],
  providers: [
    RabbitMQHealthIndicator,
    EventIngestionHealthIndicator,
    DiskSpaceHealthIndicator,
  ],
})
export class HealthModule {}
