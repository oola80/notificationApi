import { Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AdapterHealthMonitorService } from '../health-monitor/adapter-health-monitor.service.js';

@Controller()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly adapterHealthMonitor: AdapterHealthMonitorService,
  ) {}

  @Get('health')
  liveness() {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  @Get('ready')
  async readiness() {
    const [database, rabbitmq] = await Promise.all([
      this.checkDatabase(),
      this.checkRabbitMQ(),
    ]);

    const adapters = this.checkAdapters();

    const dbUp = database.status === 'up';
    const rmqUp = rabbitmq.status === 'up';
    const hasHealthyAdapter =
      adapters.total === 0 ||
      adapters.providers.some((p) => p.status === 'healthy');

    const status = dbUp && rmqUp && hasHealthyAdapter ? 'ready' : 'not_ready';

    return {
      status,
      uptime: Math.floor((Date.now() - this.startedAt) / 1000),
      checks: {
        database,
        rabbitmq,
        adapters,
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
    const start = Date.now();
    try {
      const managementUrl = this.configService.get<string>(
        'rabbitmq.managementUrl',
        'http://localhost:15672',
      );
      const user = this.configService.get<string>(
        'rabbitmq.user',
        'notificationapi',
      );
      const password = this.configService.get<string>('rabbitmq.password', '');
      const vhost = encodeURIComponent(
        this.configService.get<string>('rabbitmq.vhost', 'vhnotificationapi'),
      );

      const auth = Buffer.from(`${user}:${password}`).toString('base64');

      const response = await fetch(`${managementUrl}/api/queues/${vhost}`, {
        headers: { Authorization: `Basic ${auth}` },
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

  private checkAdapters(): {
    total: number;
    healthy: number;
    unhealthy: number;
    providers: Array<{
      providerId: string;
      providerName: string;
      status: string;
      lastCheckAt: string | null;
    }>;
  } {
    const statusMap = this.adapterHealthMonitor.getHealthStatus();
    const providers = Array.from(statusMap.values()).map((s) => ({
      providerId: s.providerId,
      providerName: s.providerName,
      status: s.status,
      lastCheckAt: s.lastCheckAt,
    }));

    const healthy = providers.filter((p) => p.status === 'healthy').length;
    const unhealthy = providers.filter((p) => p.status !== 'healthy').length;

    return {
      total: providers.length,
      healthy,
      unhealthy,
      providers,
    };
  }
}
