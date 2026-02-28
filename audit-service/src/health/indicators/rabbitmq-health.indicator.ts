import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RabbitMQHealthIndicator {
  private readonly managementUrl: string;
  private readonly vhost: string;
  private readonly user: string;
  private readonly password: string;

  constructor(private readonly config: ConfigService) {
    this.managementUrl = this.config.get<string>(
      'rabbitmq.managementUrl',
      'http://localhost:15672',
    );
    this.vhost = this.config.get<string>(
      'rabbitmq.vhost',
      'vhnotificationapi',
    );
    this.user = this.config.get<string>('rabbitmq.user', 'notificationapi');
    this.password = this.config.get<string>('rabbitmq.password', '');
  }

  async check(): Promise<{ status: string; latencyMs: number; consumers?: number }> {
    const start = Date.now();
    try {
      const encodedVhost = encodeURIComponent(this.vhost);
      const url = `${this.managementUrl}/api/queues/${encodedVhost}`;
      const auth = Buffer.from(`${this.user}:${this.password}`).toString(
        'base64',
      );

      const response = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return { status: 'down', latencyMs: Date.now() - start };
      }

      const queues = (await response.json()) as any[];
      const totalConsumers = queues.reduce(
        (sum: number, q: any) => sum + (q.consumers ?? 0),
        0,
      );

      return {
        status: 'up',
        latencyMs: Date.now() - start,
        consumers: totalConsumers,
      };
    } catch {
      return { status: 'down', latencyMs: Date.now() - start };
    }
  }
}
