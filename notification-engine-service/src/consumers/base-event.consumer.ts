import { Logger } from '@nestjs/common';
import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';

const NON_RETRYABLE_CODES = new Set([
  'NES-002',
  'NES-003',
  'NES-009',
  'NES-015',
  'NES-019',
  'NES-020',
]);

export abstract class BaseEventConsumer {
  protected abstract readonly logger: Logger;
  protected abstract readonly exchangeName: string;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly amqpConnection: AmqpConnection,
  ) {}

  protected async retryOrDlq(
    message: any,
    amqpMsg: any,
    error: Error,
  ): Promise<void | Nack> {
    const maxRetries = this.configService.get<number>(
      'rabbitmq.dlqMaxRetries',
      3,
    );
    const retryCount = this.getRetryCount(amqpMsg);
    const routingKey = amqpMsg?.fields?.routingKey ?? '';

    if (!this.isRetryable(error) || retryCount >= maxRetries) {
      this.logger.error({
        msg: 'Message sent to DLQ',
        retryCount,
        maxRetries,
        routingKey,
        error: this.getErrorMessage(error),
        nonRetryable: !this.isRetryable(error),
      });
      return new Nack(false);
    }

    const delayMs = this.calculateDelay(retryCount);
    this.logger.warn({
      msg: 'Retrying message',
      retryCount: retryCount + 1,
      maxRetries,
      delayMs,
      routingKey,
      error: this.getErrorMessage(error),
    });

    await this.delay(delayMs);

    try {
      await this.amqpConnection.publish(
        this.exchangeName,
        routingKey,
        message,
        {
          persistent: true,
          contentType: 'application/json',
          headers: {
            ...amqpMsg?.properties?.headers,
            'x-retry-count': retryCount + 1,
          },
        },
      );
    } catch (publishError) {
      this.logger.error({
        msg: 'Failed to republish for retry',
        routingKey,
        error: (publishError as Error).message,
      });
      return new Nack(false);
    }
  }

  protected isRetryable(error: Error): boolean {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null) {
        const code = (response as any).code;
        if (code && NON_RETRYABLE_CODES.has(code)) {
          return false;
        }
      }
    }
    return true;
  }

  protected calculateDelay(retryCount: number): number {
    const initialDelay = this.configService.get<number>(
      'rabbitmq.retryInitialDelayMs',
      1000,
    );
    const multiplier = this.configService.get<number>(
      'rabbitmq.retryBackoffMultiplier',
      2,
    );
    const maxDelay = this.configService.get<number>(
      'rabbitmq.retryMaxDelayMs',
      30000,
    );

    const delay = initialDelay * Math.pow(multiplier, retryCount);
    return Math.min(delay, maxDelay);
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  protected getRetryCount(amqpMsg: any): number {
    return amqpMsg?.properties?.headers?.['x-retry-count'] ?? 0;
  }

  protected getErrorMessage(error: Error): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null) {
        return (response as any).message ?? error.message;
      }
    }
    return error.message;
  }
}
