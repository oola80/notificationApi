import { Module } from '@nestjs/common';
import { EventMappingsModule } from '../event-mappings/event-mappings.module.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';
import { MappingCacheService } from './mapping-cache.service.js';
import { MappingCacheConsumer } from './mapping-cache.consumer.js';

@Module({
  imports: [EventMappingsModule, AppRabbitMQModule],
  providers: [MappingCacheService, MappingCacheConsumer],
  exports: [MappingCacheService],
})
export class MappingCacheModule {}
