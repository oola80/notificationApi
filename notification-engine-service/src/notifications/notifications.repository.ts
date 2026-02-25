import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
  Not,
  In,
} from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { Notification } from './entities/notification.entity.js';

const FAILED_STATUSES = ['FAILED'];

@Injectable()
export class NotificationsRepository extends PgBaseRepository<Notification> {
  constructor(
    @InjectRepository(Notification)
    repository: Repository<Notification>,
  ) {
    super(repository);
  }

  async findByNotificationId(
    notificationId: string,
  ): Promise<Notification | null> {
    return this.repository.findOne({ where: { notificationId } });
  }

  async findWithFilters(filters: {
    status?: string;
    channel?: string;
    eventType?: string;
    ruleId?: string;
    recipientEmail?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    data: Notification[];
    total: number;
    page: number;
    limit: number;
  }> {
    const where: FindOptionsWhere<Notification> = {};

    if (filters.status) where.status = filters.status;
    if (filters.channel) where.channel = filters.channel;
    if (filters.eventType) where.eventType = filters.eventType;
    if (filters.ruleId) where.ruleId = filters.ruleId;
    if (filters.recipientEmail) where.recipientEmail = filters.recipientEmail;

    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    if (filters.dateFrom || filters.dateTo) {
      const qb = this.repository.createQueryBuilder('n');

      if (filters.status)
        qb.andWhere('n.status = :status', { status: filters.status });
      if (filters.channel)
        qb.andWhere('n.channel = :channel', { channel: filters.channel });
      if (filters.eventType)
        qb.andWhere('n.event_type = :eventType', {
          eventType: filters.eventType,
        });
      if (filters.ruleId)
        qb.andWhere('n.rule_id = :ruleId', { ruleId: filters.ruleId });
      if (filters.recipientEmail)
        qb.andWhere('n.recipient_email = :recipientEmail', {
          recipientEmail: filters.recipientEmail,
        });
      if (filters.dateFrom)
        qb.andWhere('n.created_at >= :dateFrom', {
          dateFrom: filters.dateFrom,
        });
      if (filters.dateTo)
        qb.andWhere('n.created_at <= :dateTo', { dateTo: filters.dateTo });

      qb.orderBy('n.created_at', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);

      const [data, total] = await qb.getManyAndCount();
      return { data, total, page, limit };
    }

    return this.findWithPagination({
      where,
      page,
      limit,
      order: { createdAt: 'DESC' },
    });
  }

  async createNotification(data: Partial<Notification>): Promise<Notification> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async updateStatus(
    notificationId: string,
    status: string,
    errorMessage?: string,
  ): Promise<void> {
    const updateData: Partial<Notification> = { status };
    if (errorMessage !== undefined) {
      updateData.errorMessage = errorMessage;
    }
    await this.repository.update({ notificationId }, updateData);
  }

  async findForSuppressionCheck(
    ruleId: string,
    dedupKeyHash: string,
    windowMinutes: number,
  ): Promise<Notification[]> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    return this.repository
      .createQueryBuilder('n')
      .where('n.rule_id = :ruleId', { ruleId })
      .andWhere('n.dedup_key_hash = :dedupKeyHash', { dedupKeyHash })
      .andWhere('n.created_at >= :windowStart', { windowStart })
      .andWhere('n.status NOT IN (:...failedStatuses)', {
        failedStatuses: FAILED_STATUSES,
      })
      .orderBy('n.created_at', 'DESC')
      .getMany();
  }

  async countForSuppressionCheck(
    ruleId: string,
    dedupKeyHash: string,
    windowMinutes: number,
  ): Promise<number> {
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    return this.repository
      .createQueryBuilder('n')
      .where('n.rule_id = :ruleId', { ruleId })
      .andWhere('n.dedup_key_hash = :dedupKeyHash', { dedupKeyHash })
      .andWhere('n.created_at >= :windowStart', { windowStart })
      .andWhere('n.status NOT IN (:...failedStatuses)', {
        failedStatuses: FAILED_STATUSES,
      })
      .getCount();
  }

  async updateRenderedContent(
    notificationId: string,
    content: Record<string, any>,
  ): Promise<void> {
    await this.repository.update(
      { notificationId },
      { renderedContent: content },
    );
  }

  async updateTemplateVersion(
    notificationId: string,
    templateVersion: number,
  ): Promise<void> {
    await this.repository.update({ notificationId }, { templateVersion });
  }

  async findMostRecentForSuppression(
    ruleId: string,
    dedupKeyHash: string,
  ): Promise<Notification | null> {
    return this.repository
      .createQueryBuilder('n')
      .where('n.rule_id = :ruleId', { ruleId })
      .andWhere('n.dedup_key_hash = :dedupKeyHash', { dedupKeyHash })
      .andWhere('n.status NOT IN (:...failedStatuses)', {
        failedStatuses: FAILED_STATUSES,
      })
      .orderBy('n.created_at', 'DESC')
      .getOne();
  }
}
