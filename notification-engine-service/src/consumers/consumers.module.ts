import { Module } from '@nestjs/common';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';
import { RulesModule } from '../rules/rules.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RecipientsModule } from '../recipients/recipients.module.js';
import { PreferencesModule } from '../preferences/preferences.module.js';
import { OverridesModule } from '../overrides/overrides.module.js';
import { TemplateClientModule } from '../template-client/template-client.module.js';
import { EventProcessingPipelineService } from './event-processing-pipeline.service.js';
import { CriticalEventConsumer } from './critical-event.consumer.js';
import { NormalEventConsumer } from './normal-event.consumer.js';
import { RuleCacheInvalidationConsumer } from './rule-cache-invalidation.consumer.js';
import { OverrideCacheInvalidationConsumer } from './override-cache-invalidation.consumer.js';
import { StatusInboundConsumer } from './status-inbound.consumer.js';

@Module({
  imports: [
    AppRabbitMQModule,
    RulesModule,
    NotificationsModule,
    RecipientsModule,
    PreferencesModule,
    OverridesModule,
    TemplateClientModule,
  ],
  providers: [
    EventProcessingPipelineService,
    CriticalEventConsumer,
    NormalEventConsumer,
    RuleCacheInvalidationConsumer,
    OverrideCacheInvalidationConsumer,
    StatusInboundConsumer,
  ],
  exports: [EventProcessingPipelineService],
})
export class ConsumersModule {}
