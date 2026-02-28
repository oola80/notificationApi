import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';

@Injectable()
export class DlqPublisher {
  private readonly logger = new Logger(DlqPublisher.name);

  constructor(private readonly amqpConnection: AmqpConnection) {}

  async republish(
    exchange: string,
    routingKey: string,
    payload: Record<string, any>,
  ): Promise<void> {
    this.logger.log({
      msg: 'Republishing DLQ entry',
      exchange,
      routingKey,
    });

    await this.amqpConnection.publish(exchange, routingKey || '', payload);
  }
}
