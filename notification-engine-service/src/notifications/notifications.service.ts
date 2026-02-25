import { Injectable, Logger } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationStatusLogRepository } from './notification-status-log.repository.js';
import { NotificationRecipientsRepository } from './notification-recipients.repository.js';
import { NotificationLifecycleService } from './notification-lifecycle.service.js';
import { TemplateClientService } from '../template-client/template-client.service.js';
import { NotificationPublisherService } from '../rabbitmq/notification-publisher.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { Notification } from './entities/notification.entity.js';
import { NotificationStatusLog } from './entities/notification-status-log.entity.js';
import { NotificationRecipient } from './entities/notification-recipient.entity.js';
import { ListNotificationsQueryDto, ManualSendDto } from './dto/index.js';
import { createErrorResponse } from '../common/errors.js';
import { PaginatedResult } from '../common/base/pg-base.repository.js';

const MANUAL_SEND_EVENT_ID = '00000000-0000-0000-0000-000000000000';
const MANUAL_SEND_RULE_ID = '00000000-0000-0000-0000-000000000000';

export interface ManualSendResult {
  notificationId: string;
  channel: string;
  recipientEmail: string | null;
  recipientPhone: string | null;
  status: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly statusLogRepository: NotificationStatusLogRepository,
    private readonly recipientsRepository: NotificationRecipientsRepository,
    private readonly lifecycleService: NotificationLifecycleService,
    private readonly templateClientService: TemplateClientService,
    private readonly notificationPublisher: NotificationPublisherService,
    private readonly metricsService: MetricsService,
  ) {}

  async create(data: Partial<Notification>): Promise<Notification> {
    const notification = await this.notificationsRepository.createNotification({
      ...data,
      status: 'PENDING',
    });

    await this.statusLogRepository.createLogEntry(
      notification.notificationId,
      null,
      'PENDING',
      notification.channel,
    );

    this.logger.log(
      `Notification created: ${notification.notificationId} (channel=${notification.channel})`,
    );
    return notification;
  }

  async findAll(
    query: ListNotificationsQueryDto,
  ): Promise<PaginatedResult<Notification>> {
    return this.notificationsRepository.findWithFilters({
      status: query.status,
      channel: query.channel,
      eventType: query.eventType,
      ruleId: query.ruleId,
      recipientEmail: query.recipientEmail,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      page: query.page,
      limit: query.limit,
    });
  }

  async findById(notificationId: string): Promise<{
    notification: Notification;
    timeline: NotificationStatusLog[];
    recipients: NotificationRecipient[];
  }> {
    const notification =
      await this.notificationsRepository.findByNotificationId(notificationId);

    if (!notification) {
      throw createErrorResponse('NES-003');
    }

    const [timeline, recipients] = await Promise.all([
      this.statusLogRepository.findByNotificationId(notificationId),
      this.recipientsRepository.findByNotificationId(notificationId),
    ]);

    return { notification, timeline, recipients };
  }

  async getTimeline(notificationId: string): Promise<NotificationStatusLog[]> {
    const notification =
      await this.notificationsRepository.findByNotificationId(notificationId);

    if (!notification) {
      throw createErrorResponse('NES-003');
    }

    return this.statusLogRepository.findByNotificationId(notificationId);
  }

  async manualSend(dto: ManualSendDto): Promise<ManualSendResult[]> {
    const results: ManualSendResult[] = [];
    const priority = dto.priority ?? 'normal';

    for (const channel of dto.channels) {
      for (const recipient of dto.recipients) {
        const result = await this.processManualSendItem(
          dto,
          channel,
          recipient,
          priority,
        );
        results.push(result);
      }
    }

    this.logger.log(
      `Manual send: ${results.length} notifications processed for template ${dto.templateId}`,
    );
    return results;
  }

  private async processManualSendItem(
    dto: ManualSendDto,
    channel: string,
    recipient: {
      email?: string;
      phone?: string;
      deviceToken?: string;
      name?: string;
    },
    priority: string,
  ): Promise<ManualSendResult> {
    // 1. Create notification (PENDING)
    const notification = await this.create({
      eventId: MANUAL_SEND_EVENT_ID,
      ruleId: MANUAL_SEND_RULE_ID,
      templateId: dto.templateId,
      channel,
      priority,
      recipientEmail: recipient.email ?? null,
      recipientPhone: recipient.phone ?? null,
      recipientName: recipient.name ?? null,
    });

    const notificationId = notification.notificationId;
    this.metricsService.incrementNotificationsCreated(channel, priority);

    await this.recipientsRepository.createBatch([
      {
        notificationId,
        recipientType: 'custom',
        email: recipient.email ?? null,
        phone: recipient.phone ?? null,
        memberName: recipient.name ?? null,
      },
    ]);

    // 2. Transition to PROCESSING
    await this.lifecycleService.transition(notificationId, 'PROCESSING');

    // 3. Render template
    const renderStart = process.hrtime.bigint();
    try {
      const renderResult = await this.templateClientService.render(
        dto.templateId,
        channel,
        dto.data ?? {},
      );

      const renderSeconds = Number(process.hrtime.bigint() - renderStart) / 1e9;
      this.metricsService.observeTemplateRender(channel, renderSeconds);
      this.metricsService.incrementTemplateRender(channel, 'success');

      // 4. Transition to RENDERING — set renderedContent + templateVersion
      await this.lifecycleService.transition(notificationId, 'RENDERING');
      await this.notificationsRepository.updateRenderedContent(notificationId, {
        subject: renderResult.subject,
        body: renderResult.body,
        templateVersion: renderResult.templateVersion,
      });

      if (renderResult.templateVersion) {
        await this.notificationsRepository.updateTemplateVersion(
          notificationId,
          renderResult.templateVersion,
        );
      }
    } catch (error) {
      const renderSeconds = Number(process.hrtime.bigint() - renderStart) / 1e9;
      this.metricsService.observeTemplateRender(channel, renderSeconds);
      this.metricsService.incrementTemplateRender(channel, 'failure');
      this.metricsService.incrementFailed(channel, 'template_render');

      await this.lifecycleService.transition(notificationId, 'FAILED', {
        errorMessage: `Template render failed: ${(error as Error).message}`,
      });

      return {
        notificationId,
        channel,
        recipientEmail: recipient.email ?? null,
        recipientPhone: recipient.phone ?? null,
        status: 'FAILED',
      };
    }

    // 5. Transition to DELIVERING
    await this.lifecycleService.transition(notificationId, 'DELIVERING');

    // 6. Dispatch
    try {
      await this.notificationPublisher.publishToDeliver({
        notificationId,
        eventId: MANUAL_SEND_EVENT_ID,
        ruleId: MANUAL_SEND_RULE_ID,
        channel,
        priority,
        recipient: {
          email: recipient.email,
          phone: recipient.phone,
          deviceToken: recipient.deviceToken,
          name: recipient.name,
        },
        content: {
          subject: notification.renderedContent?.subject,
          body: notification.renderedContent?.body ?? '',
          templateVersion: notification.templateVersion ?? undefined,
        },
        metadata: {
          manualSend: true,
          templateId: dto.templateId,
        },
      });

      this.metricsService.incrementDispatched(channel, priority);

      // 7. Transition to SENT (optimistic)
      await this.lifecycleService.transition(notificationId, 'SENT');

      return {
        notificationId,
        channel,
        recipientEmail: recipient.email ?? null,
        recipientPhone: recipient.phone ?? null,
        status: 'SENT',
      };
    } catch (error) {
      this.metricsService.incrementFailed(channel, 'dispatch');

      await this.lifecycleService.transition(notificationId, 'FAILED', {
        errorMessage: `Dispatch failed: ${(error as Error).message}`,
      });

      return {
        notificationId,
        channel,
        recipientEmail: recipient.email ?? null,
        recipientPhone: recipient.phone ?? null,
        status: 'FAILED',
      };
    }
  }
}
