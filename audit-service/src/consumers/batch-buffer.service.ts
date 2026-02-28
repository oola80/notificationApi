import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import { MetricsService } from '../metrics/metrics.service.js';

interface BufferEntry {
  record: any;
  resolve: (value: void | Nack) => void;
}

@Injectable()
export class BatchBufferService implements OnModuleDestroy {
  private readonly logger = new Logger(BatchBufferService.name);
  private readonly buffers = new Map<string, BufferEntry[]>();
  private readonly flushHandlers = new Map<
    string,
    (records: any[]) => Promise<void>
  >();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly retryTracker = new Map<string, number>();
  private shuttingDown = false;

  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly retryDelayMs: number;
  private readonly maxRetries: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.batchSize = this.configService.get<number>(
      'app.consumerBatchSize',
      50,
    );
    this.flushIntervalMs = this.configService.get<number>(
      'app.consumerFlushIntervalMs',
      2000,
    );
    this.retryDelayMs = this.configService.get<number>(
      'app.consumerRetryDelayMs',
      5000,
    );
    this.maxRetries = this.configService.get<number>(
      'app.consumerMaxRetries',
      3,
    );
  }

  registerFlushHandler(
    queueName: string,
    handler: (records: any[]) => Promise<void>,
  ): void {
    this.flushHandlers.set(queueName, handler);
  }

  async add(queueName: string, record: any): Promise<void | Nack> {
    return new Promise<void | Nack>((resolve) => {
      const buffer = this.buffers.get(queueName) ?? [];
      buffer.push({ record, resolve });
      this.buffers.set(queueName, buffer);

      if (buffer.length >= this.batchSize) {
        this.clearTimer(queueName);
        void this.flush(queueName);
      } else if (!this.timers.has(queueName)) {
        const timer = setTimeout(() => {
          this.timers.delete(queueName);
          void this.flush(queueName);
        }, this.flushIntervalMs);
        this.timers.set(queueName, timer);
      }
    });
  }

  private async flush(queueName: string): Promise<void> {
    const entries = this.buffers.get(queueName) ?? [];
    this.buffers.set(queueName, []);
    this.clearTimer(queueName);

    if (entries.length === 0) return;

    const handler = this.flushHandlers.get(queueName);
    if (!handler) {
      this.logger.error({
        msg: 'No flush handler registered',
        queue: queueName,
      });
      for (const entry of entries) entry.resolve(undefined);
      return;
    }

    const startTime = Date.now();

    try {
      await handler(entries.map((e) => e.record));

      const duration = Date.now() - startTime;
      this.metricsService.observeConsumerBatchDuration(queueName, duration);
      this.metricsService.observeConsumerBatchSize(queueName, entries.length);

      for (const entry of entries) {
        entry.resolve(undefined);
        this.retryTracker.delete(this.fingerprint(entry.record));
      }
    } catch (error) {
      const errorMsg = (error as Error).message;
      this.logger.warn({
        msg: 'Batch insert failed',
        queue: queueName,
        batchSize: entries.length,
        error: errorMsg,
      });

      if (this.isTransientError(error)) {
        if (!this.shuttingDown && this.retryDelayMs > 0) {
          await this.delay(this.retryDelayMs);
        }

        let poisonCount = 0;
        for (const entry of entries) {
          const fp = this.fingerprint(entry.record);
          const retryCount = (this.retryTracker.get(fp) ?? 0) + 1;

          if (retryCount >= this.maxRetries) {
            entry.resolve(undefined);
            this.retryTracker.delete(fp);
            poisonCount++;
          } else {
            this.retryTracker.set(fp, retryCount);
            entry.resolve(new Nack(true));
          }
        }

        if (poisonCount > 0) {
          this.metricsService.incrementPoisonMessages(queueName);
          this.logger.error({
            msg: 'Messages discarded as poison',
            queue: queueName,
            poisonCount,
          });
        }
      } else {
        for (const entry of entries) {
          entry.resolve(undefined);
          this.retryTracker.delete(this.fingerprint(entry.record));
        }
        this.metricsService.incrementPoisonMessages(queueName);
        this.logger.error({
          msg: 'Permanent batch failure, all messages discarded',
          queue: queueName,
          discardedCount: entries.length,
          error: errorMsg,
        });
      }
    }
  }

  private clearTimer(queueName: string): void {
    const timer = this.timers.get(queueName);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(queueName);
    }
  }

  fingerprint(record: any): string {
    const content = JSON.stringify(record);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return hash.toString(36);
  }

  isTransientError(error: unknown): boolean {
    const pgTransientCodes = new Set([
      '08000',
      '08003',
      '08006',
      '40001',
      '40P01',
      '55P03',
      '57014',
    ]);

    if (error instanceof Error) {
      const pgError = error as any;
      if (pgError.code && pgTransientCodes.has(pgError.code)) return true;
      if (
        pgError.message?.includes('Connection') ||
        pgError.message?.includes('timeout') ||
        pgError.message?.includes('ECONNREFUSED') ||
        pgError.message?.includes('ECONNRESET')
      ) {
        return true;
      }
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;

    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    const flushPromises: Promise<void>[] = [];
    for (const queueName of this.buffers.keys()) {
      if ((this.buffers.get(queueName) ?? []).length > 0) {
        flushPromises.push(this.flush(queueName));
      }
    }

    await Promise.allSettled(flushPromises);
  }

  getBufferSize(queueName: string): number {
    return (this.buffers.get(queueName) ?? []).length;
  }
}
