import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventSource } from './entities/event-source.entity.js';
import { EventSourcesRepository } from './event-sources.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([EventSource])],
  providers: [EventSourcesRepository],
  exports: [EventSourcesRepository],
})
export class EventSourcesModule {}
