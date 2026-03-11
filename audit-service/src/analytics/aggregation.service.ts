import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import {
  NotificationAnalyticsRepository,
  AggregationRow,
} from './notification-analytics.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';

@Injectable()
export class AggregationService {
  private readonly logger = new Logger(AggregationService.name);

  constructor(
    private readonly analyticsRepo: NotificationAnalyticsRepository,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {}

  @Cron(process.env.ANALYTICS_HOURLY_CRON ?? '5 * * * *', {
    name: 'hourly-aggregation',
  })
  async runHourlyAggregation(): Promise<void> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMinutes(0, 0, 0);

    const periodStart = new Date(periodEnd);
    periodStart.setHours(periodStart.getHours() - 1);

    this.logger.log({
      msg: 'Starting hourly aggregation',
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });

    await this.aggregate('hourly', periodStart, periodEnd);
  }

  @Cron(process.env.ANALYTICS_DAILY_CRON ?? '15 0 * * *', {
    name: 'daily-aggregation',
  })
  async runDailyAggregation(): Promise<void> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setHours(0, 0, 0, 0);

    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 1);

    this.logger.log({
      msg: 'Starting daily aggregation',
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });

    await this.aggregate('daily', periodStart, periodEnd);
  }

  async aggregate(
    period: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<void> {
    const start = Date.now();

    try {
      const receiptRows =
        await this.analyticsRepo.aggregateFromReceipts(periodStart, periodEnd);

      const suppressionCounts =
        await this.analyticsRepo.countSuppressed(periodStart, periodEnd);

      // Merge suppression counts into receipt rows
      for (const row of receiptRows) {
        row.totalSuppressed = suppressionCounts[row.channel] ?? 0;
      }

      // Add channels that only appear in suppression data
      for (const [channel, count] of Object.entries(suppressionCounts)) {
        if (
          channel !== '_unknown' &&
          !receiptRows.find((r) => r.channel === channel)
        ) {
          receiptRows.push({
            channel,
            eventType: null,
            totalSent: 0,
            totalDelivered: 0,
            totalFailed: 0,
            totalOpened: 0,
            totalClicked: 0,
            totalBounced: 0,
            totalSuppressed: count,
            avgLatencyMs: null,
          });
        }
      }

      // Upsert per-channel rows
      for (const row of receiptRows) {
        await this.analyticsRepo.upsertRow(period, periodStart, row);
      }

      // Compute and upsert _all cross-channel totals
      const crossTotal = this.computeCrossTotal(receiptRows);
      await this.analyticsRepo.upsertRow(period, periodStart, crossTotal);

      const durationMs = Date.now() - start;
      this.metricsService.observeAggregationDuration(period, durationMs);

      this.logger.log({
        msg: 'Aggregation complete',
        period,
        periodStart: periodStart.toISOString(),
        channelCount: receiptRows.length,
        durationMs,
      });
    } catch (error) {
      this.logger.error({
        msg: 'Aggregation failed',
        period,
        periodStart: periodStart.toISOString(),
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async runManualAggregation(
    period?: 'hourly' | 'daily',
  ): Promise<{ hourly: boolean; daily: boolean }> {
    const result = { hourly: false, daily: false };
    const now = new Date();

    if (!period || period === 'hourly') {
      const currentHourEnd = new Date(now);
      currentHourEnd.setMinutes(0, 0, 0);
      // If we're past the hour mark, include the current partial hour
      if (now.getMinutes() > 0) {
        currentHourEnd.setHours(currentHourEnd.getHours() + 1);
      }

      // Aggregate 24 one-hour windows
      for (let i = 0; i < 24; i++) {
        const windowEnd = new Date(currentHourEnd);
        windowEnd.setHours(windowEnd.getHours() - i);
        const windowStart = new Date(windowEnd);
        windowStart.setHours(windowStart.getHours() - 1);
        await this.aggregate('hourly', windowStart, windowEnd);
      }
      result.hourly = true;
    }

    if (!period || period === 'daily') {
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      await this.aggregate('daily', todayStart, now);
      result.daily = true;
    }

    this.logger.log({
      msg: 'Manual aggregation complete',
      period: period ?? 'both',
      result,
    });

    return result;
  }

  private computeCrossTotal(rows: AggregationRow[]): AggregationRow {
    const total: AggregationRow = {
      channel: '_all',
      eventType: null,
      totalSent: 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalOpened: 0,
      totalClicked: 0,
      totalBounced: 0,
      totalSuppressed: 0,
      avgLatencyMs: null,
    };

    for (const row of rows) {
      total.totalSent += row.totalSent;
      total.totalDelivered += row.totalDelivered;
      total.totalFailed += row.totalFailed;
      total.totalOpened += row.totalOpened;
      total.totalClicked += row.totalClicked;
      total.totalBounced += row.totalBounced;
      total.totalSuppressed += row.totalSuppressed;
    }

    return total;
  }
}
