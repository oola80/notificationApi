import { Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import type { ConsumeMessage } from 'amqplib';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import {
  EventProcessingService,
  EventProcessingResult,
} from './event-processing.service.js';
import { RabbitMqEventMessage } from '../rabbitmq/interfaces/rabbitmq-event-message.interface.js';
import { parseIncomingRoutingKey } from '../rabbitmq/rabbitmq.constants.js';
import { createErrorResponse } from '../common/errors.js';
import { HttpException } from '@nestjs/common';

const NON_RETRYABLE_CODES = new Set([
  'EIS-003',
  'EIS-005',
  'EIS-008',
  'EIS-014',
  'EIS-016',
  'EIS-020',
]);

export abstract class BaseEventConsumer {
  protected abstract readonly logger: Logger;
  protected abstract readonly exchangeName: string;

  constructor(
    protected readonly eventProcessingService: EventProcessingService,
    protected readonly configService: ConfigService,
    protected readonly amqpConnection: AmqpConnection,
  ) {}

  protected async handleMessage(
    message: RabbitMqEventMessage,
    amqpMsg: ConsumeMessage,
  ): Promise<EventProcessingResult> {
    const routingKey = amqpMsg.fields.routingKey;

    let sourceId: string;
    let eventType: string;

    try {
      const parsed = parseIncomingRoutingKey(routingKey);
      sourceId = parsed.sourceId;
      eventType = parsed.eventType;
    } catch {
      throw createErrorResponse(
        'EIS-020',
        `Invalid routing key: ${routingKey}`,
      );
    }

    const correlationId =
      message.correlationId ??
      (amqpMsg.properties.correlationId as string | undefined) ??
      crypto.randomUUID();

    return this.eventProcessingService.processEvent({
      sourceId: message.sourceId ?? sourceId,
      cycleId: message.cycleId,
      eventType: message.eventType ?? eventType,
      sourceEventId: message.sourceEventId,
      timestamp: message.timestamp,
      payload: message.payload,
      correlationId,
    });
  }

  protected async retryOrDlq(
    message: RabbitMqEventMessage,
    amqpMsg: ConsumeMessage,
    error: unknown,
    exchange: string,
  ): Promise<Nack | void> {
    const retryCount = this.getRetryCount(amqpMsg);
    const maxRetries = this.configService.get<number>(
      'rabbitmq.dlqMaxRetries',
      3,
    );

    if (this.isRetryable(error) && retryCount < maxRetries) {
      const delay = this.calculateDelay(retryCount);

      this.logger.warn(
        `Retrying message (attempt ${retryCount + 1}/${maxRetries}) after ${delay}ms: ${this.getErrorMessage(error)}`,
      );

      await this.delay(delay);

      const routingKey = amqpMsg.fields.routingKey;
      const headers = { ...(amqpMsg.properties.headers ?? {}) };
      headers['x-retry-count'] = retryCount + 1;

      await this.amqpConnection.publish(exchange, routingKey, message, {
        persistent: true,
        contentType: 'application/json',
        correlationId: amqpMsg.properties.correlationId,
        headers,
      });

      // ACK original by returning void
      return;
    }

    this.logger.error(
      `Sending message to DLQ after ${retryCount} retries: ${this.getErrorMessage(error)}`,
    );

    // Nack without requeue → DLX routes to DLQ
    return new Nack(false);
  }

  protected isRetryable(error: unknown): boolean {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (
        typeof response === 'object' &&
        response !== null &&
        'code' in response
      ) {
        return !NON_RETRYABLE_CODES.has((response as { code: string }).code);
      }
    }
    // Unknown errors are retryable
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

    return Math.min(initialDelay * Math.pow(multiplier, retryCount), maxDelay);
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getRetryCount(amqpMsg: ConsumeMessage): number {
    const headers = amqpMsg.properties.headers;
    if (headers && typeof headers['x-retry-count'] === 'number') {
      return headers['x-retry-count'];
    }
    return 0;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }
}
