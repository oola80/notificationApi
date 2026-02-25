import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { RuleCacheService } from '../rules/rule-cache.service.js';
import { RabbitMQHealthIndicator } from './rabbitmq.health-indicator.js';

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly dataSource: DataSource,
    private readonly amqpConnection: AmqpConnection,
    private readonly configService: ConfigService,
    private readonly ruleCacheService: RuleCacheService,
    private readonly rabbitMQHealthIndicator: RabbitMQHealthIndicator,
  ) {}

  @Get()
  async check() {
    const [database, rabbitmq, templateService, queues] = await Promise.all([
      this.checkDatabase(),
      this.checkRabbitMQ(),
      this.checkTemplateService(),
      this.getQueueDepths(),
    ]);

    const ruleCache = {
      enabled: this.ruleCacheService.isEnabled(),
      ruleCount: this.ruleCacheService.size,
      lastInvalidation: this.ruleCacheService.getLastInvalidation(),
    };

    const dbUp = database.status === 'up';
    const rmqUp = rabbitmq.status === 'up';
    const tsUp = templateService.status === 'up';

    let status: string;
    if (!dbUp || !rmqUp) {
      status = 'unhealthy';
    } else if (!tsUp) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    return {
      status,
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      checks: {
        database,
        rabbitmq,
        templateService,
        queues,
        ruleCache,
      },
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

  private checkRabbitMQ(): {
    status: string;
    latencyMs: number;
  } {
    const start = Date.now();
    const isConnected = this.amqpConnection.connected;
    return {
      status: isConnected ? 'up' : 'down',
      latencyMs: Date.now() - start,
    };
  }

  private async checkTemplateService(): Promise<{
    status: string;
    latencyMs: number;
  }> {
    const start = Date.now();
    const templateUrl = this.configService.get<string>(
      'app.templateServiceUrl',
      'http://localhost:3153',
    );

    try {
      const response = await fetch(`${templateUrl}/health`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      return {
        status: response.ok ? 'up' : 'down',
        latencyMs: Date.now() - start,
      };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  private async getQueueDepths(): Promise<
    Record<string, { depth: number; consumers: number }>
  > {
    try {
      const result = await this.rabbitMQHealthIndicator.isHealthy('rabbitmq');
      const queuesData = result.rabbitmq?.queues as
        | Record<string, { messages: number; consumers: number }>
        | undefined;

      if (!queuesData) return {};

      const formatted: Record<string, { depth: number; consumers: number }> =
        {};
      for (const [queue, data] of Object.entries(queuesData)) {
        formatted[queue] = {
          depth: data.messages,
          consumers: data.consumers,
        };
      }
      return formatted;
    } catch {
      return {};
    }
  }
}
