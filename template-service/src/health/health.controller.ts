import { Controller, Get, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { TemplateCacheService } from '../rendering/services/template-cache.service.js';

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    @Optional() private readonly cacheService?: TemplateCacheService,
  ) {}

  @Get()
  async check() {
    const [database, rabbitmq] = await Promise.all([
      this.checkDatabase(),
      this.checkRabbitMQ(),
    ]);

    const cache = this.getCacheStatus();

    const dbUp = database.status === 'up';
    const rmqUp = rabbitmq.status === 'up';
    const status = dbUp && rmqUp ? 'healthy' : dbUp ? 'degraded' : 'unhealthy';

    return {
      status,
      service: 'template-service',
      version: '0.0.1',
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      checks: {
        database,
        rabbitmq,
        cache,
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

  private async checkRabbitMQ(): Promise<{
    status: string;
    latencyMs: number;
  }> {
    const managementUrl = this.configService.get<string>(
      'rabbitmq.managementUrl',
      'http://localhost:15672',
    );
    const user = this.configService.get<string>('rabbitmq.user', 'guest');
    const password = this.configService.get<string>('rabbitmq.password', '');

    const start = Date.now();
    try {
      const response = await fetch(`${managementUrl}/api/healthchecks/node`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      const ok = response.ok;
      return {
        status: ok ? 'up' : 'down',
        latencyMs: Date.now() - start,
      };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }

  private getCacheStatus(): {
    status: string;
    size: number;
    maxSize: number;
  } {
    if (!this.cacheService) {
      return { status: 'unavailable', size: 0, maxSize: 0 };
    }
    const stats = this.cacheService.getStats();
    return {
      status: 'up',
      size: stats.size,
      maxSize: stats.maxSize,
    };
  }
}
