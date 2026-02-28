import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository, PaginatedResult } from '../common/base/pg-base.repository.js';
import { DlqEntry, DlqEntryStatus } from './entities/dlq-entry.entity.js';

export interface DlqFilters {
  status?: string;
  originalQueue?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class DlqEntriesRepository extends PgBaseRepository<DlqEntry> {
  constructor(
    @InjectRepository(DlqEntry)
    repository: Repository<DlqEntry>,
  ) {
    super(repository);
  }

  async countPending(): Promise<number> {
    return this.repository.count({
      where: { status: DlqEntryStatus.PENDING },
    });
  }

  async findWithFilters(
    filters: DlqFilters,
  ): Promise<PaginatedResult<DlqEntry>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const skip = (page - 1) * limit;

    const qb = this.repository.createQueryBuilder('d');

    if (filters.status) {
      qb.andWhere('d.status = :status', { status: filters.status });
    }

    if (filters.originalQueue) {
      qb.andWhere('d.originalQueue = :originalQueue', {
        originalQueue: filters.originalQueue,
      });
    }

    if (filters.from) {
      qb.andWhere('d.capturedAt >= :from', { from: filters.from });
    }

    if (filters.to) {
      qb.andWhere('d.capturedAt <= :to', { to: filters.to });
    }

    qb.orderBy('d.capturedAt', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async statusCounts(): Promise<Record<string, number>> {
    const rows = await this.repository
      .createQueryBuilder('d')
      .select('d.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('d.status')
      .getRawMany();

    const counts: Record<string, number> = {
      pending: 0,
      investigated: 0,
      reprocessed: 0,
      discarded: 0,
    };

    for (const row of rows) {
      counts[row.status] = row.count;
    }

    return counts;
  }

  async updateEntry(
    id: string,
    updates: Partial<DlqEntry>,
  ): Promise<void> {
    await this.repository.update(id, updates);
  }
}
