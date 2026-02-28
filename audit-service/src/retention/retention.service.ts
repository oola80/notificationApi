import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  @Cron('0 3 * * *', { name: 'payload-purge' })
  async purgePayloads(): Promise<{ auditEventsPurged: number; deliveryReceiptsPurged: number }> {
    const retentionDays =
      this.configService.get<number>('app.retentionPayloadDays') ?? 90;

    this.logger.log({
      msg: 'Starting payload purge',
      retentionDays,
    });

    try {
      const result = await this.dataSource.query(
        'SELECT purge_audit_payloads($1) as result',
        [retentionDays],
      );

      const purgeResult = result?.[0]?.result ?? {};
      this.logger.log({
        msg: 'Payload purge complete',
        auditEventsPurged: purgeResult.auditEventsPurged ?? 0,
        deliveryReceiptsPurged: purgeResult.deliveryReceiptsPurged ?? 0,
      });

      return {
        auditEventsPurged: purgeResult.auditEventsPurged ?? 0,
        deliveryReceiptsPurged: purgeResult.deliveryReceiptsPurged ?? 0,
      };
    } catch (error) {
      this.logger.error({
        msg: 'Payload purge failed',
        error: (error as Error).message,
      });
      throw error;
    }
  }

  @Cron('30 3 * * *', { name: 'dlq-cleanup' })
  async cleanupDlqEntries(): Promise<number> {
    const retentionDays = 90;

    this.logger.log({
      msg: 'Starting DLQ entry cleanup',
      retentionDays,
    });

    try {
      const result = await this.dataSource.query(
        `DELETE FROM dlq_entries
         WHERE status IN ('reprocessed', 'discarded')
         AND resolved_at < NOW() - ($1 || ' days')::INTERVAL`,
        [retentionDays],
      );

      const rowsDeleted = result?.[1] ?? 0;

      this.logger.log({
        msg: 'DLQ entry cleanup complete',
        rowsDeleted,
      });

      return rowsDeleted;
    } catch (error) {
      this.logger.error({
        msg: 'DLQ entry cleanup failed',
        error: (error as Error).message,
      });
      throw error;
    }
  }
}
