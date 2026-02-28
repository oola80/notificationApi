import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository, PaginatedResult } from '../common/base/pg-base.repository.js';
import { AuditEvent } from './entities/audit-event.entity.js';

export interface AuditLogFilters {
  notificationId?: string;
  correlationId?: string;
  cycleId?: string;
  eventType?: string;
  actor?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface FullTextSearchParams {
  query: string;
  useRawTsquery?: boolean;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AuditEventsRepository extends PgBaseRepository<AuditEvent> {
  constructor(
    @InjectRepository(AuditEvent)
    repository: Repository<AuditEvent>,
  ) {
    super(repository);
  }

  async findWithFilters(
    filters: AuditLogFilters,
  ): Promise<PaginatedResult<AuditEvent>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const skip = (page - 1) * limit;

    const qb = this.repository
      .createQueryBuilder('ae')
      .select([
        'ae.id',
        'ae.notificationId',
        'ae.correlationId',
        'ae.cycleId',
        'ae.eventType',
        'ae.actor',
        'ae.metadata',
        'ae.payloadSnapshot',
        'ae.createdAt',
      ]);

    if (filters.notificationId) {
      qb.andWhere('ae.notificationId = :notificationId', {
        notificationId: filters.notificationId,
      });
    }

    if (filters.correlationId) {
      qb.andWhere('ae.correlationId = :correlationId', {
        correlationId: filters.correlationId,
      });
    }

    if (filters.cycleId) {
      qb.andWhere('ae.cycleId = :cycleId', {
        cycleId: filters.cycleId,
      });
    }

    if (filters.eventType) {
      qb.andWhere('ae.eventType = :eventType', {
        eventType: filters.eventType,
      });
    }

    if (filters.actor) {
      qb.andWhere('ae.actor = :actor', { actor: filters.actor });
    }

    if (filters.from) {
      qb.andWhere('ae.createdAt >= :from', { from: filters.from });
    }

    if (filters.to) {
      qb.andWhere('ae.createdAt <= :to', { to: filters.to });
    }

    if (filters.q) {
      qb.andWhere('ae.search_vector @@ plainto_tsquery(:q)', {
        q: filters.q,
      });
    }

    qb.orderBy('ae.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async fullTextSearch(
    params: FullTextSearchParams,
  ): Promise<PaginatedResult<AuditEvent>> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const skip = (page - 1) * limit;

    const tsFunction = params.useRawTsquery
      ? 'to_tsquery'
      : 'plainto_tsquery';

    const qb = this.repository
      .createQueryBuilder('ae')
      .select([
        'ae.id',
        'ae.notificationId',
        'ae.correlationId',
        'ae.cycleId',
        'ae.eventType',
        'ae.actor',
        'ae.metadata',
        'ae.payloadSnapshot',
        'ae.createdAt',
      ])
      .addSelect(
        `ts_rank_cd(ae.search_vector, ${tsFunction}(:query))`,
        'rank',
      )
      .where(`ae.search_vector @@ ${tsFunction}(:query)`, {
        query: params.query,
      });

    if (params.from) {
      qb.andWhere('ae.createdAt >= :from', { from: params.from });
    }

    if (params.to) {
      qb.andWhere('ae.createdAt <= :to', { to: params.to });
    }

    qb.orderBy('rank', 'DESC').addOrderBy('ae.createdAt', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async findByNotificationIdOrdered(
    notificationId: string,
  ): Promise<AuditEvent[]> {
    return this.repository.find({
      where: { notificationId },
      order: { createdAt: 'ASC' },
    });
  }

  async findDistinctNotificationIds(
    column: 'correlationId' | 'cycleId',
    value: string,
  ): Promise<string[]> {
    const columnName =
      column === 'correlationId' ? 'correlation_id' : 'cycle_id';

    const rows = await this.repository
      .createQueryBuilder('ae')
      .select('DISTINCT ae.notification_id', 'notificationId')
      .where(`ae.${columnName} = :value`, { value })
      .andWhere('ae.notification_id IS NOT NULL')
      .getRawMany();

    return rows.map((r: { notificationId: string }) => r.notificationId);
  }
}
