import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DlqEntry } from './entities/dlq-entry.entity.js';
import { DlqEntriesRepository } from './dlq-entries.repository.js';
import { DlqController } from './dlq.controller.js';
import { DlqService } from './dlq.service.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([DlqEntry]), AppRabbitMQModule],
  controllers: [DlqController],
  providers: [DlqEntriesRepository, DlqService],
  exports: [DlqEntriesRepository],
})
export class DlqModule {}
