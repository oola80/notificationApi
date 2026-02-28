import { Injectable, Optional } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../../metrics/metrics.service.js';
import { ALL_CONSUMED_QUEUES } from '../../rabbitmq/rabbitmq.constants.js';

@Injectable()
export class ConsumerHealthIndicator {
  private readonly managementUrl: string;
  private readonly vhost: string;
  private readonly user: string;
  private readonly password: string;

  constructor(
    @Optional() private readonly amqpConnection: AmqpConnection,
    private readonly config: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
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

  async check(): Promise<{
    status: string;
    connected: boolean;
    queueDepths?: Record<string, number>;
  }> {
    const connected = this.isConnected();
    let queueDepths: Record<string, number> | undefined;

    try {
      queueDepths = await this.fetchQueueDepths();

      for (const [queue, depth] of Object.entries(queueDepths)) {
        this.metricsService.setConsumerLag(queue, depth);
      }
    } catch {
      // Queue depth fetch is best-effort
    }

    return {
      status: connected ? 'up' : 'down',
      connected,
      queueDepths,
    };
  }

  private isConnected(): boolean {
    if (!this.amqpConnection) return false;
    try {
      return this.amqpConnection.connected;
    } catch {
      return false;
    }
  }

  private async fetchQueueDepths(): Promise<Record<string, number>> {
    const depths: Record<string, number> = {};
    const encodedVhost = encodeURIComponent(this.vhost);
    const auth = Buffer.from(`${this.user}:${this.password}`).toString(
      'base64',
    );

    for (const queueName of ALL_CONSUMED_QUEUES) {
      try {
        const url = `${this.managementUrl}/api/queues/${encodedVhost}/${encodeURIComponent(queueName)}`;
        const response = await fetch(url, {
          headers: { Authorization: `Basic ${auth}` },
          signal: AbortSignal.timeout(3000),
        });

        if (response.ok) {
          const data = (await response.json()) as any;
          depths[queueName] = data.messages ?? 0;
        }
      } catch {
        // Individual queue fetch failure is non-critical
      }
    }

    return depths;
  }
}
