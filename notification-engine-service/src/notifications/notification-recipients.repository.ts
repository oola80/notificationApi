import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationRecipient } from './entities/notification-recipient.entity.js';

@Injectable()
export class NotificationRecipientsRepository {
  constructor(
    @InjectRepository(NotificationRecipient)
    private readonly repository: Repository<NotificationRecipient>,
  ) {}

  async createBatch(
    recipients: Partial<NotificationRecipient>[],
  ): Promise<NotificationRecipient[]> {
    const entities = this.repository.create(recipients);
    return this.repository.save(entities);
  }

  async findByNotificationId(
    notificationId: string,
  ): Promise<NotificationRecipient[]> {
    return this.repository.find({
      where: { notificationId },
      order: { createdAt: 'ASC' },
    });
  }
}
