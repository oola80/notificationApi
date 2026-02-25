import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { NotificationRule } from './entities/notification-rule.entity.js';

@Injectable()
export class NotificationRulesRepository extends PgBaseRepository<NotificationRule> {
  constructor(
    @InjectRepository(NotificationRule)
    repository: Repository<NotificationRule>,
  ) {
    super(repository);
  }

  async findByEventType(
    eventType: string,
    activeOnly = true,
  ): Promise<NotificationRule[]> {
    const qb = this.repository
      .createQueryBuilder('rule')
      .where('rule.event_type = :eventType', { eventType })
      .orderBy('rule.priority', 'ASC');

    if (activeOnly) {
      qb.andWhere('rule.is_active = true');
    }

    return qb.getMany();
  }

  async findAllActive(): Promise<NotificationRule[]> {
    return this.repository.find({
      where: { isActive: true },
      order: { priority: 'ASC' },
    });
  }

  async existsActiveDuplicate(
    eventType: string,
    conditions: Record<string, any> | null | undefined,
    excludeId?: string,
  ): Promise<boolean> {
    const qb = this.repository
      .createQueryBuilder('rule')
      .where('rule.event_type = :eventType', { eventType })
      .andWhere('rule.is_active = true');

    if (conditions != null) {
      qb.andWhere('rule.conditions @> :conditions', {
        conditions: JSON.stringify(conditions),
      });
      qb.andWhere('rule.conditions <@ :conditions', {
        conditions: JSON.stringify(conditions),
      });
    } else {
      qb.andWhere('rule.conditions IS NULL');
    }

    if (excludeId) {
      qb.andWhere('rule.id != :excludeId', { excludeId });
    }

    return (await qb.getCount()) > 0;
  }

  async save(entity: NotificationRule): Promise<NotificationRule> {
    return this.repository.save(entity);
  }

  async create(data: Partial<NotificationRule>): Promise<NotificationRule> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }
}
