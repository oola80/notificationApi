import { Injectable, Logger } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { BaseDeliveryConsumer } from './base-delivery.consumer.js';
import { DeliveryPipelineService } from '../delivery/delivery-pipeline.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  EXCHANGE_NOTIFICATIONS_DELIVER,
  EXCHANGE_NOTIFICATIONS_DLQ,
  QUEUE_DELIVER_WHATSAPP_NORMAL,
} from '../rabbitmq/rabbitmq.constants.js';

@Injectable()
export class WhatsappNormalConsumer extends BaseDeliveryConsumer {
  protected readonly logger = new Logger(WhatsappNormalConsumer.name);
  protected readonly channel = 'whatsapp';
  protected readonly priority = 'normal';
  protected readonly queueName = QUEUE_DELIVER_WHATSAPP_NORMAL;

  constructor(
    pipelineService: DeliveryPipelineService,
    metricsService: MetricsService,
  ) {
    super(pipelineService, metricsService);
  }

  @RabbitSubscribe({
    exchange: EXCHANGE_NOTIFICATIONS_DELIVER,
    routingKey: 'notification.deliver.normal.whatsapp',
    queue: QUEUE_DELIVER_WHATSAPP_NORMAL,
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
