import { Injectable } from '@nestjs/common';
import { NotificationAnalyticsRepository } from './notification-analytics.repository.js';
import { QueryAnalyticsDto } from './dto/query-analytics.dto.js';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly analyticsRepo: NotificationAnalyticsRepository,
  ) {}

  async query(dto: QueryAnalyticsDto) {
    const result = await this.analyticsRepo.findWithFilters({
      period: dto.period ?? 'daily',
      from: dto.from,
      to: dto.to,
      channel: dto.channel,
      eventType: dto.eventType,
      page: dto.page,
      limit: dto.pageSize,
    });

    return {
      data: result.data,
      meta: {
        period: dto.period ?? 'daily',
        from: dto.from,
        to: dto.to,
        totalRecords: result.total,
      },
    };
  }

  async summary() {
    const now = new Date();

    // Today boundaries
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    // Last 7 days boundaries
    const sevenDaysAgo = new Date(todayStart);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Query today's hourly data (use _all channel for totals)
    const todayRows = await this.analyticsRepo.findForSummary(
      'hourly',
      todayStart,
      todayEnd,
    );

    // Query last 7 days daily data
    const weekRows = await this.analyticsRepo.findForSummary(
      'daily',
      sevenDaysAgo,
      todayStart,
    );

    // Compute today totals from _all channel rows
    const todayAllRows = todayRows.filter((r) => r.channel === '_all');
    const todayTotals = this.sumRows(todayAllRows);

    // Compute 7-day totals from _all channel rows
    const weekAllRows = weekRows.filter((r) => r.channel === '_all');
    const weekTotals = this.sumRows(weekAllRows);

    // Compute channel breakdown for today (exclude _all)
    const todayChannelRows = todayRows.filter((r) => r.channel !== '_all');
    const channelBreakdown = this.computeChannelBreakdown(todayChannelRows);

    const todayDeliveryRate =
      todayTotals.totalSent > 0
        ? Number(
            ((todayTotals.totalDelivered / todayTotals.totalSent) * 100).toFixed(
              2,
            ),
          )
        : 0;

    const todayFailureRate =
      todayTotals.totalSent > 0
        ? Number(
            ((todayTotals.totalFailed / todayTotals.totalSent) * 100).toFixed(2),
          )
        : 0;

    const weekDeliveryRate =
      weekTotals.totalSent > 0
        ? Number(
            ((weekTotals.totalDelivered / weekTotals.totalSent) * 100).toFixed(
              2,
            ),
          )
        : 0;

    return {
      today: {
        totalSent: todayTotals.totalSent,
        totalDelivered: todayTotals.totalDelivered,
        deliveryRate: todayDeliveryRate,
        totalFailed: todayTotals.totalFailed,
        failureRate: todayFailureRate,
      },
      last7Days: {
        totalSent: weekTotals.totalSent,
        totalDelivered: weekTotals.totalDelivered,
        deliveryRate: weekDeliveryRate,
        avgLatencyMs: weekTotals.avgLatencyMs,
      },
      channelBreakdown,
    };
  }

  private sumRows(rows: { totalSent: number; totalDelivered: number; totalFailed: number; avgLatencyMs: number | null }[]) {
    let totalSent = 0;
    let totalDelivered = 0;
    let totalFailed = 0;
    let latencySum = 0;
    let latencyCount = 0;

    for (const row of rows) {
      totalSent += row.totalSent;
      totalDelivered += row.totalDelivered;
      totalFailed += row.totalFailed;
      if (row.avgLatencyMs !== null) {
        latencySum += Number(row.avgLatencyMs);
        latencyCount++;
      }
    }

    return {
      totalSent,
      totalDelivered,
      totalFailed,
      avgLatencyMs:
        latencyCount > 0
          ? Number((latencySum / latencyCount).toFixed(2))
          : null,
    };
  }

  private computeChannelBreakdown(
    rows: { channel: string; totalSent: number; totalDelivered: number }[],
  ) {
    const channelMap = new Map<
      string,
      { sent: number; delivered: number }
    >();

    for (const row of rows) {
      const existing = channelMap.get(row.channel) ?? {
        sent: 0,
        delivered: 0,
      };
      existing.sent += row.totalSent;
      existing.delivered += row.totalDelivered;
      channelMap.set(row.channel, existing);
    }

    return Array.from(channelMap.entries()).map(([channel, data]) => ({
      channel,
      totalSent: data.sent,
      totalDelivered: data.delivered,
      deliveryRate:
        data.sent > 0
          ? Number(((data.delivered / data.sent) * 100).toFixed(2))
          : 0,
    }));
  }
}
