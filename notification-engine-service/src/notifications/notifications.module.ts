import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity.js';
import { NotificationStatusLog } from './entities/notification-status-log.entity.js';
import { NotificationRecipient } from './entities/notification-recipient.entity.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationStatusLogRepository } from './notification-status-log.repository.js';
import { NotificationRecipientsRepository } from './notification-recipients.repository.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationLifecycleService } from './notification-lifecycle.service.js';
import { DedupKeyResolverService } from './suppression/dedup-key-resolver.service.js';
import { SuppressionEvaluatorService } from './suppression/suppression-evaluator.service.js';
import { NotificationsController } from './notifications.controller.js';
import { TemplateClientModule } from '../template-client/template-client.module.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationStatusLog,
      NotificationRecipient,
    ]),
    TemplateClientModule,
    AppRabbitMQModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    NotificationStatusLogRepository,
    NotificationRecipientsRepository,
    NotificationsService,
    NotificationLifecycleService,
    DedupKeyResolverService,
    SuppressionEvaluatorService,
  ],
  exports: [
    NotificationsService,
    NotificationLifecycleService,
    DedupKeyResolverService,
    SuppressionEvaluatorService,
    NotificationsRepository,
  ],
})
export class NotificationsModule {}
