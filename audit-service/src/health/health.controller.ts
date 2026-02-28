import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RabbitMQHealthIndicator } from './indicators/rabbitmq-health.indicator.js';
import { DlqPendingHealthIndicator } from './indicators/dlq-pending-health.indicator.js';
import { ConsumerHealthIndicator } from './indicators/consumer-health.indicator.js';

@Controller()
export class HealthController {
  constructor(
    private readonly dataSource: DataSource,
    private readonly rabbitMQHealth: RabbitMQHealthIndicator,
    private readonly dlqPendingHealth: DlqPendingHealthIndicator,
    private readonly consumerHealth: ConsumerHealthIndicator,
  ) {}

  @Get('health')
  liveness() {
    return {
      status: 'ok',
      service: 'audit-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health/ready')
  async readiness() {
    const [database, rabbitmq, dlqDepth, consumers] = await Promise.all([
      this.checkDatabase(),
      this.rabbitMQHealth.check(),
      this.dlqPendingHealth.check(),
      this.consumerHealth.check(),
    ]);

    const allUp =
      database.status === 'up' &&
      rabbitmq.status === 'up' &&
      dlqDepth.status === 'ok' &&
      consumers.status === 'up';

    return {
      status: allUp ? 'ready' : 'degraded',
      checks: {
        database,
        rabbitmq,
        dlqDepth,
        consumers,
      },
    };
  }

  private async checkDatabase(): Promise<{
    status: string;
    responseTime: number;
  }> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up', responseTime: Date.now() - start };
    } catch {
      return { status: 'down', responseTime: Date.now() - start };
    }
  }
}
