import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';

const NES_QUEUES = [
  'q.engine.events.critical',
  'q.engine.events.normal',
  'q.engine.status.inbound',
];

@Injectable()
export class RabbitMQHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RabbitMQHealthIndicator.name);

  constructor(
    private readonly amqpConnection: AmqpConnection,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const isConnected = this.amqpConnection.connected;

    if (!isConnected) {
      return this.getStatus(key, false, { message: 'RabbitMQ disconnected' });
    }

    const queues = await this.getQueueDepths();

    return this.getStatus(key, true, { queues });
  }

  private async getQueueDepths(): Promise<
    Record<string, { messages: number; consumers: number }>
  > {
    const result: Record<string, { messages: number; consumers: number }> = {};

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

      for (const queue of NES_QUEUES) {
        try {
          const response = await fetch(
            `${managementUrl}/api/queues/${vhost}/${encodeURIComponent(queue)}`,
            {
              headers: { Authorization: `Basic ${auth}` },
              signal: AbortSignal.timeout(3000),
            },
          );

          if (response.ok) {
            const data = await response.json();
            result[queue] = {
              messages: data.messages ?? 0,
              consumers: data.consumers ?? 0,
            };
          }
        } catch {
          result[queue] = { messages: -1, consumers: -1 };
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to fetch queue depths: ${(error as Error).message}`,
      );
    }

    return result;
  }
}
