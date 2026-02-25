import { Nack, AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { BaseEventConsumer } from './base-event.consumer.js';
import { createErrorResponse } from '../common/errors.js';

class TestConsumer extends BaseEventConsumer {
  protected readonly logger = new Logger(TestConsumer.name);
  protected readonly exchangeName = 'xch.test';

  constructor(configService: ConfigService, amqpConnection: AmqpConnection) {
    super(configService, amqpConnection);
  }

  // Expose protected methods for testing
  async testRetryOrDlq(message: any, amqpMsg: any, error: Error) {
    return this.retryOrDlq(message, amqpMsg, error);
  }

  testIsRetryable(error: Error) {
    return this.isRetryable(error);
  }

  testCalculateDelay(retryCount: number) {
    return this.calculateDelay(retryCount);
  }
}

describe('BaseEventConsumer', () => {
  let consumer: TestConsumer;
  let configService: jest.Mocked<ConfigService>;
  let amqpConnection: jest.Mocked<AmqpConnection>;

  const defaultConfig: Record<string, any> = {
    'rabbitmq.dlqMaxRetries': 3,
    'rabbitmq.retryInitialDelayMs': 1000,
    'rabbitmq.retryBackoffMultiplier': 2,
    'rabbitmq.retryMaxDelayMs': 30000,
  };

  beforeEach(() => {
    configService = {
      get: jest.fn(
        (key: string, defaultVal?: any) => defaultConfig[key] ?? defaultVal,
      ),
    } as any;

    amqpConnection = {
      publish: jest.fn().mockResolvedValue(undefined),
    } as any;

    consumer = new TestConsumer(configService, amqpConnection);

    // Speed up tests
    jest.spyOn(consumer as any, 'delay').mockResolvedValue(undefined);
  });

  describe('isRetryable', () => {
    it('should return true for generic errors', () => {
      expect(consumer.testIsRetryable(new Error('timeout'))).toBe(true);
    });

    it('should return false for NES-002 (RULE_NOT_FOUND)', () => {
      const error = createErrorResponse('NES-002');
      expect(consumer.testIsRetryable(error)).toBe(false);
    });

    it('should return false for NES-003 (NOTIFICATION_NOT_FOUND)', () => {
      const error = createErrorResponse('NES-003');
      expect(consumer.testIsRetryable(error)).toBe(false);
    });

    it('should return false for NES-009 (VALIDATION_FAILED)', () => {
      const error = createErrorResponse('NES-009');
      expect(consumer.testIsRetryable(error)).toBe(false);
    });

    it('should return false for NES-015 (INVALID_STATUS_TRANSITION)', () => {
      const error = createErrorResponse('NES-015');
      expect(consumer.testIsRetryable(error)).toBe(false);
    });

    it('should return false for NES-019 (TEMPLATE_NOT_FOUND)', () => {
      const error = createErrorResponse('NES-019');
      expect(consumer.testIsRetryable(error)).toBe(false);
    });

    it('should return true for NES-016 (RABBITMQ_PUBLISH_FAILED)', () => {
      const error = createErrorResponse('NES-016');
      expect(consumer.testIsRetryable(error)).toBe(true);
    });

    it('should return true for NES-018 (TEMPLATE_RENDER_FAILED)', () => {
      const error = createErrorResponse('NES-018');
      expect(consumer.testIsRetryable(error)).toBe(true);
    });

    it('should return true for HttpException without error code', () => {
      const error = new HttpException('Bad Gateway', 502);
      expect(consumer.testIsRetryable(error)).toBe(true);
    });
  });

  describe('calculateDelay', () => {
    it('should return initial delay for first retry', () => {
      expect(consumer.testCalculateDelay(0)).toBe(1000);
    });

    it('should apply exponential backoff', () => {
      expect(consumer.testCalculateDelay(1)).toBe(2000);
      expect(consumer.testCalculateDelay(2)).toBe(4000);
      expect(consumer.testCalculateDelay(3)).toBe(8000);
    });

    it('should cap at max delay', () => {
      expect(consumer.testCalculateDelay(10)).toBe(30000);
    });
  });

  describe('retryOrDlq', () => {
    const mockMessage = { eventId: 'ev-1', eventType: 'order.created' };
    const mockAmqpMsg = {
      fields: { routingKey: 'event.critical.order.created' },
      properties: { headers: {} },
    };

    it('should republish with incremented retry count on retryable error', async () => {
      const error = new Error('Connection timeout');

      const result = await consumer.testRetryOrDlq(
        mockMessage,
        mockAmqpMsg,
        error,
      );

      expect(result).toBeUndefined(); // ACK
      expect(amqpConnection.publish).toHaveBeenCalledWith(
        'xch.test',
        'event.critical.order.created',
        mockMessage,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-retry-count': 1,
          }),
        }),
      );
    });

    it('should send to DLQ on non-retryable error', async () => {
      const error = createErrorResponse('NES-002');

      const result = await consumer.testRetryOrDlq(
        mockMessage,
        mockAmqpMsg,
        error,
      );

      expect(result).toBeInstanceOf(Nack);
      expect(amqpConnection.publish).not.toHaveBeenCalled();
    });

    it('should send to DLQ after max retries exhausted', async () => {
      const error = new Error('Connection timeout');
      const msgWithRetries = {
        ...mockAmqpMsg,
        properties: { headers: { 'x-retry-count': 3 } },
      };

      const result = await consumer.testRetryOrDlq(
        mockMessage,
        msgWithRetries,
        error,
      );

      expect(result).toBeInstanceOf(Nack);
      expect(amqpConnection.publish).not.toHaveBeenCalled();
    });

    it('should increment existing retry count', async () => {
      const error = new Error('timeout');
      const msgWithRetries = {
        ...mockAmqpMsg,
        properties: { headers: { 'x-retry-count': 1 } },
      };

      await consumer.testRetryOrDlq(mockMessage, msgWithRetries, error);

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        'xch.test',
        'event.critical.order.created',
        mockMessage,
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-retry-count': 2,
          }),
        }),
      );
    });

    it('should send to DLQ when republish fails', async () => {
      const error = new Error('timeout');
      amqpConnection.publish.mockRejectedValue(new Error('publish failed'));

      const result = await consumer.testRetryOrDlq(
        mockMessage,
        mockAmqpMsg,
        error,
      );

      expect(result).toBeInstanceOf(Nack);
    });

    it('should apply delay before republishing', async () => {
      const delaySpy = jest.spyOn(consumer as any, 'delay');
      const error = new Error('timeout');

      await consumer.testRetryOrDlq(mockMessage, mockAmqpMsg, error);

      expect(delaySpy).toHaveBeenCalledWith(1000);
    });
  });
});
