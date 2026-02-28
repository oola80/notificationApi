import { Module } from '@nestjs/common';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';
import { EventsModule } from '../events/events.module.js';
import { ReceiptsModule } from '../receipts/receipts.module.js';
import { DlqModule } from '../dlq/dlq.module.js';
import { BatchBufferService } from './batch-buffer.service.js';
import { EventsConsumer } from './events.consumer.js';
import { DeliverConsumer } from './deliver.consumer.js';
import { StatusConsumer } from './status.consumer.js';
import { TemplateConsumer } from './template.consumer.js';
import { DlqConsumer } from './dlq.consumer.js';

@Module({
  imports: [AppRabbitMQModule, EventsModule, ReceiptsModule, DlqModule],
  providers: [
    BatchBufferService,
    EventsConsumer,
    DeliverConsumer,
    StatusConsumer,
    TemplateConsumer,
    DlqConsumer,
  ],
  exports: [BatchBufferService],
})
export class ConsumersModule {}
