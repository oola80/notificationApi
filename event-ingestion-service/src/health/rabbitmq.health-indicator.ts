import { Injectable, Logger } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import {
  QUEUE_EVENTS_AMQP,
  QUEUE_EVENTS_WEBHOOK,
  QUEUE_EVENTS_EMAIL_INGEST,
} from '../rabbitmq/rabbitmq.constants.js';

interface QueueInfo {
  depth: number;
  consumers: number;
}

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
    const connected = this.amqpConnection.connected;

    let queues: Record<string, QueueInfo> | undefined;
    try {
      queues = await this.fetchQueueDepths();
    } catch (error) {
      this.logger.warn(
        `Failed to fetch queue depths from Management API: ${(error as Error).message}`,
      );
    }

    const data: Record<string, any> = { connected };
    if (queues) {
      data.queues = queues;
    }

    if (!connected) {
      return this.getStatus(key, false, data);
    }

    return this.getStatus(key, true, data);
  }

  private async fetchQueueDepths(): Promise<Record<string, QueueInfo>> {
    const managementUrl = this.configService.get<string>(
      'rabbitmq.managementUrl',
    );
    const user = this.configService.get<string>('rabbitmq.user');
    const password = this.configService.get<string>('rabbitmq.password');
    const vhost = encodeURIComponent(
      this.configService.get<string>('rabbitmq.vhost')!,
    );

    const queueNames = [
      QUEUE_EVENTS_AMQP,
      QUEUE_EVENTS_WEBHOOK,
      QUEUE_EVENTS_EMAIL_INGEST,
    ];

    const credentials = Buffer.from(`${user}:${password}`).toString('base64');
    const result: Record<string, QueueInfo> = {};

    for (const queueName of queueNames) {
      const url = `${managementUrl}/api/queues/${vhost}/${encodeURIComponent(queueName)}`;
      const response = await fetch(url, {
        headers: { Authorization: `Basic ${credentials}` },
      });

      if (response.ok) {
        const data = (await response.json()) as {
          messages: number;
          consumers: number;
        };
        result[queueName] = {
          depth: data.messages,
          consumers: data.consumers,
        };
      }
    }

    return result;
  }
}
