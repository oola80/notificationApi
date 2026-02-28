import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { PgBaseRepository, PaginatedResult } from '../common/base/pg-base.repository.js';
import { NotificationAnalytics } from './entities/notification-analytics.entity.js';

export interface AnalyticsQueryFilters {
  period: string;
  from: string;
  to: string;
  channel?: string;
  eventType?: string;
  page?: number;
  limit?: number;
}

export interface AggregationRow {
  channel: string;
  eventType: string | null;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalSuppressed: number;
  avgLatencyMs: number | null;
}

@Injectable()
export class NotificationAnalyticsRepository extends PgBaseRepository<NotificationAnalytics> {
  constructor(
    @InjectRepository(NotificationAnalytics)
    repository: Repository<NotificationAnalytics>,
    private readonly dataSource: DataSource,
  ) {
    super(repository);
  }

  async findWithFilters(
    filters: AnalyticsQueryFilters,
  ): Promise<PaginatedResult<NotificationAnalytics>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const skip = (page - 1) * limit;

    const qb = this.repository.createQueryBuilder('na');

    qb.andWhere('na.period = :period', { period: filters.period });
    qb.andWhere('na.periodStart >= :from', { from: filters.from });
    qb.andWhere('na.periodStart <= :to', { to: filters.to });

    if (filters.channel) {
      qb.andWhere('na.channel = :channel', { channel: filters.channel });
    }

    if (filters.eventType) {
      qb.andWhere('na.eventType = :eventType', {
        eventType: filters.eventType,
      });
    }

    qb.orderBy('na.periodStart', 'DESC');
    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return { data, total, page, limit };
  }

  async upsertRow(
    period: string,
    periodStart: Date,
    row: AggregationRow,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO notification_analytics
        (period, period_start, channel, event_type,
         total_sent, total_delivered, total_failed,
         total_opened, total_clicked, total_bounced,
         total_suppressed, avg_latency_ms, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
       ON CONFLICT (period, period_start, channel, COALESCE(event_type, ''))
       DO UPDATE SET
         total_sent = EXCLUDED.total_sent,
         total_delivered = EXCLUDED.total_delivered,
         total_failed = EXCLUDED.total_failed,
         total_opened = EXCLUDED.total_opened,
         total_clicked = EXCLUDED.total_clicked,
         total_bounced = EXCLUDED.total_bounced,
         total_suppressed = EXCLUDED.total_suppressed,
         avg_latency_ms = EXCLUDED.avg_latency_ms,
         updated_at = NOW()`,
      [
        period,
        periodStart,
        row.channel,
        row.eventType,
        row.totalSent,
        row.totalDelivered,
        row.totalFailed,
        row.totalOpened,
        row.totalClicked,
        row.totalBounced,
        row.totalSuppressed,
        row.avgLatencyMs,
      ],
    );
  }

  async aggregateFromReceipts(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<AggregationRow[]> {
    const rows = await this.dataSource.query(
      `SELECT
         channel,
         COUNT(*) FILTER (WHERE status = 'sent')::int as total_sent,
         COUNT(*) FILTER (WHERE status = 'delivered')::int as total_delivered,
         COUNT(*) FILTER (WHERE status = 'failed')::int as total_failed,
         COUNT(*) FILTER (WHERE status = 'opened')::int as total_opened,
         COUNT(*) FILTER (WHERE status = 'clicked')::int as total_clicked,
         COUNT(*) FILTER (WHERE status = 'bounced')::int as total_bounced
       FROM delivery_receipts
       WHERE received_at >= $1 AND received_at < $2
       GROUP BY channel`,
      [periodStart, periodEnd],
    );

    return rows.map((r: any) => ({
      channel: r.channel,
      eventType: null,
      totalSent: r.total_sent ?? 0,
      totalDelivered: r.total_delivered ?? 0,
      totalFailed: r.total_failed ?? 0,
      totalOpened: r.total_opened ?? 0,
      totalClicked: r.total_clicked ?? 0,
      totalBounced: r.total_bounced ?? 0,
      totalSuppressed: 0,
      avgLatencyMs: null,
    }));
  }

  async countSuppressed(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Record<string, number>> {
    const rows = await this.dataSource.query(
      `SELECT
         COALESCE(metadata->>'channel', '_unknown') as channel,
         COUNT(*)::int as count
       FROM audit_events
       WHERE created_at >= $1 AND created_at < $2
         AND event_type LIKE '%SUPPRESS%'
       GROUP BY COALESCE(metadata->>'channel', '_unknown')`,
      [periodStart, periodEnd],
    );

    const result: Record<string, number> = {};
    for (const row of rows) {
      result[row.channel] = row.count;
    }
    return result;
  }

  async findForSummary(
    period: string,
    from: Date,
    to: Date,
    channel?: string,
  ): Promise<NotificationAnalytics[]> {
    const qb = this.repository.createQueryBuilder('na');

    qb.where('na.period = :period', { period });
    qb.andWhere('na.periodStart >= :from', { from });
    qb.andWhere('na.periodStart < :to', { to });

    if (channel) {
      qb.andWhere('na.channel = :channel', { channel });
    }

    qb.orderBy('na.periodStart', 'ASC');

    return qb.getMany();
  }
}
