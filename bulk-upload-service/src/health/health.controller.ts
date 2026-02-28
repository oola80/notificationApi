import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RabbitMQHealthIndicator } from './indicators/rabbitmq-health.indicator.js';
import { EventIngestionHealthIndicator } from './indicators/event-ingestion-health.indicator.js';
import { DiskSpaceHealthIndicator } from './indicators/disk-space-health.indicator.js';

@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly dataSource: DataSource,
    private readonly rabbitMQHealth: RabbitMQHealthIndicator,
    private readonly eventIngestionHealth: EventIngestionHealthIndicator,
    private readonly diskSpaceHealth: DiskSpaceHealthIndicator,
  ) {}

  @Get('health')
  async liveness() {
    const database = await this.checkDatabase();
    return {
      status: database.status === 'up' ? 'ok' : 'error',
      info: { database },
      error: database.status !== 'up' ? { database } : {},
    };
  }

  @Get('ready')
  async readiness() {
    const [database, rabbitmq, eventIngestion, diskSpace] = await Promise.all([
      this.checkDatabase(),
      this.rabbitMQHealth.check(),
      this.eventIngestionHealth.check(),
      this.diskSpaceHealth.check(),
    ]);

    const allUp =
      database.status === 'up' &&
      rabbitmq.status === 'up' &&
      eventIngestion.status === 'up' &&
      diskSpace.status === 'up';

    const info: Record<string, any> = {};
    const error: Record<string, any> = {};

    for (const [key, value] of Object.entries({
      database,
      rabbitmq,
      eventIngestion,
      diskSpace,
    })) {
      if (value.status === 'up') {
        info[key] = value;
      } else {
        error[key] = value;
      }
    }

    return {
      status: allUp ? 'ok' : 'error',
      info,
      error,
    };
  }

  private async checkDatabase(): Promise<{
    status: string;
    latencyMs: number;
  }> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', latencyMs: Date.now() - start };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }
}
