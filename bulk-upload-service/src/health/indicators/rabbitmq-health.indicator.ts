import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RabbitMQHealthIndicator {
  private readonly logger = new Logger(RabbitMQHealthIndicator.name);

  constructor(private readonly configService: ConfigService) {}

  async check(): Promise<{ status: string; latencyMs: number }> {
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
      const password = this.configService.get<string>(
        'rabbitmq.password',
        '',
      );

      const auth = Buffer.from(`${user}:${password}`).toString('base64');

      const response = await fetch(
        `${managementUrl}/api/health/checks/alarms`,
        {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(5000),
        },
      );

      return {
        status: response.ok ? 'up' : 'down',
        latencyMs: Date.now() - start,
      };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }
}
