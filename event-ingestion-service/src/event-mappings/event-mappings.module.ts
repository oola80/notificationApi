import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventMapping } from './entities/event-mapping.entity.js';
import { EventMappingsController } from './event-mappings.controller.js';
import { EventMappingsService } from './event-mappings.service.js';
import { EventMappingsRepository } from './event-mappings.repository.js';
import { NormalizationModule } from '../normalization/normalization.module.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([EventMapping]),
    NormalizationModule,
    AppRabbitMQModule,
  ],
  controllers: [EventMappingsController],
  providers: [EventMappingsService, EventMappingsRepository],
  exports: [EventMappingsService, EventMappingsRepository],
})
export class EventMappingsModule {}
