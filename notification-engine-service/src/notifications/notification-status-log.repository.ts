import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationStatusLog } from './entities/notification-status-log.entity.js';

@Injectable()
export class NotificationStatusLogRepository {
  constructor(
    @InjectRepository(NotificationStatusLog)
    private readonly repository: Repository<NotificationStatusLog>,
  ) {}

  async createLogEntry(
    notificationId: string,
    fromStatus: string | null,
    toStatus: string,
    channel?: string,
    metadata?: Record<string, any>,
  ): Promise<NotificationStatusLog> {
    const entity = this.repository.create({
      notificationId,
      fromStatus: fromStatus ?? null,
      toStatus,
      channel: channel ?? null,
      metadata: metadata ?? null,
    });
    return this.repository.save(entity);
  }

  async findByNotificationId(
    notificationId: string,
  ): Promise<NotificationStatusLog[]> {
    return this.repository.find({
      where: { notificationId },
      order: { createdAt: 'ASC' },
    });
  }
}
