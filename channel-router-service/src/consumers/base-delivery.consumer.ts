import { Logger } from '@nestjs/common';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import { DeliveryPipelineService } from '../delivery/delivery-pipeline.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { DispatchMessage } from '../delivery/interfaces/dispatch-message.interface.js';

export abstract class BaseDeliveryConsumer {
  protected abstract readonly logger: Logger;
  protected abstract readonly channel: string;
  protected abstract readonly priority: string;
  protected abstract readonly queueName: string;

  constructor(
    protected readonly pipelineService: DeliveryPipelineService,
    protected readonly metricsService: MetricsService,
  ) {}

  async handleMessage(
    message: DispatchMessage,
    _amqpMsg: any,
  ): Promise<void | Nack> {
    this.logger.log(
      `Received message: ${message.notificationId} channel=${this.channel} priority=${this.priority}`,
    );

    try {
      await this.pipelineService.execute(message);
      return;
    } catch (error) {
      this.logger.error(
        `Unhandled error processing ${message.notificationId}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      return new Nack(false);
    }
  }
}
