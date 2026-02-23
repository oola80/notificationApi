import { Module } from '@nestjs/common';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';
import { EventMappingsModule } from '../event-mappings/event-mappings.module.js';
import { EventsModule } from '../events/events.module.js';
import { EventSourcesModule } from '../event-sources/event-sources.module.js';
import { NormalizationModule } from '../normalization/normalization.module.js';
import { MappingCacheModule } from '../mapping-cache/mapping-cache.module.js';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module.js';
import { EventProcessingService } from './event-processing.service.js';
import { DeduplicationService } from '../webhook/services/deduplication.service.js';
import { AmqpEventConsumer } from './amqp-event.consumer.js';
import { WebhookEventConsumer } from './webhook-event.consumer.js';
import { EmailIngestEventConsumer } from './email-ingest-event.consumer.js';

@Module({
  imports: [
    AppRabbitMQModule,
    EventMappingsModule,
    EventsModule,
    EventSourcesModule,
    NormalizationModule,
    MappingCacheModule,
    RateLimiterModule,
  ],
  providers: [
    EventProcessingService,
    DeduplicationService,
    AmqpEventConsumer,
    WebhookEventConsumer,
    EmailIngestEventConsumer,
  ],
  exports: [EventProcessingService],
})
export class ConsumersModule {}
