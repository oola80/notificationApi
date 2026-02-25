import { Injectable, Logger } from '@nestjs/common';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationStatusLogRepository } from './notification-status-log.repository.js';
import { createErrorResponse } from '../common/errors.js';

export const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['PROCESSING'],
  PROCESSING: ['SUPPRESSED', 'RENDERING', 'FAILED'],
  RENDERING: ['DELIVERING', 'FAILED'],
  DELIVERING: ['SENT', 'FAILED'],
  SENT: ['DELIVERED', 'FAILED'],
};

export const TERMINAL_STATUSES = ['SUPPRESSED', 'DELIVERED', 'FAILED'];

@Injectable()
export class NotificationLifecycleService {
  private readonly logger = new Logger(NotificationLifecycleService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly statusLogRepository: NotificationStatusLogRepository,
  ) {}

  async transition(
    notificationId: string,
    toStatus: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    const notification =
      await this.notificationsRepository.findByNotificationId(notificationId);

    if (!notification) {
      throw createErrorResponse('NES-003');
    }

    const fromStatus = notification.status;
    const allowedTargets = VALID_TRANSITIONS[fromStatus];

    if (!allowedTargets || !allowedTargets.includes(toStatus)) {
      throw createErrorResponse(
        'NES-015',
        `Invalid status transition from ${fromStatus} to ${toStatus}`,
      );
    }

    await this.notificationsRepository.updateStatus(
      notificationId,
      toStatus,
      metadata?.errorMessage,
    );

    this.statusLogRepository
      .createLogEntry(
        notificationId,
        fromStatus,
        toStatus,
        notification.channel,
        metadata,
      )
      .catch((err) => {
        this.logger.error(
          `Failed to create status log for ${notificationId}: ${err.message}`,
        );
      });

    this.logger.log(
      `Notification ${notificationId}: ${fromStatus} → ${toStatus}`,
    );
  }
}
