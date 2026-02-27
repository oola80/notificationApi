import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { BaseDeliveryConsumer } from './base-delivery.consumer.js';
import { DeliveryPipelineService } from '../delivery/delivery-pipeline.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_DLQ,
  QUEUE_DELIVER_PUSH_NORMAL,
} from '../rabbitmq/rabbitmq.constants.js';

@Injectable()
export class PushNormalConsumer extends BaseDeliveryConsumer {
  protected readonly logger = new Logger(PushNormalConsumer.name);
  protected readonly channel = 'push';
  protected readonly priority = 'normal';
  protected readonly queueName = QUEUE_DELIVER_PUSH_NORMAL;

  constructor(
    pipelineService: DeliveryPipelineService,
    metricsService: MetricsService,
  ) {
    super(pipelineService, metricsService);
  }

  @RabbitSubscribe({
    exchange: EXCHANGE_NOTIFICATIONS_DELIVER,
    routingKey: 'notification.deliver.normal.push',
    queue: QUEUE_DELIVER_PUSH_NORMAL,
    queueOptions: {
      durable: true,
      channel: 'channel-normal',
      arguments: { 'x-dead-letter-exchange': EXCHANGE_NOTIFICATIONS_DLQ },
    },
    createQueueIfNotExists: false,
  })
  async handle(message: Record<string, any>, amqpMsg: any) {
    return this.handleMessage(message as any, amqpMsg);
  }
}
