import { Logger, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { BaseEventConsumer } from './base-event.consumer.js';
import { EventProcessingService } from './event-processing.service.js';
import { createErrorResponse } from '../common/errors.js';

class TestConsumer extends BaseEventConsumer {
  protected readonly logger = new Logger('TestConsumer');
  protected readonly exchangeName = 'xch.test';

  constructor(
    eventProcessingService: EventProcessingService,
    configService: ConfigService,
    amqpConnection: AmqpConnection,
  ) {
    super(eventProcessingService, configService, amqpConnection);
  }

  public testCalculateDelay(retryCount: number): number {
    return this.calculateDelay(retryCount);
  }

  public testIsRetryable(error: unknown): boolean {
    return this.isRetryable(error);
  }
}

describe('BaseEventConsumer', () => {
  let consumer: TestConsumer;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        'rabbitmq.retryInitialDelayMs': 1000,
        'rabbitmq.retryBackoffMultiplier': 2,
        'rabbitmq.retryMaxDelayMs': 30000,
        'rabbitmq.dlqMaxRetries': 3,
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(() => {
    consumer = new TestConsumer(
      {} as EventProcessingService,
      mockConfigService as unknown as ConfigService,
      {} as AmqpConnection,
    );
  });

  describe('calculateDelay', () => {
    it('should return initial delay (1000ms) for retryCount=0', () => {
      expect(consumer.testCalculateDelay(0)).toBe(1000);
    });

    it('should return 2000ms for retryCount=1 (1000 * 2^1)', () => {
      expect(consumer.testCalculateDelay(1)).toBe(2000);
    });

    it('should cap at maxDelay (30000ms) for high retryCount', () => {
      expect(consumer.testCalculateDelay(20)).toBe(30000);
    });
  });

  describe('isRetryable', () => {
    it('should return false for NON_RETRYABLE codes', () => {
      const nonRetryableCodes = [
        'EIS-003',
        'EIS-005',
        'EIS-008',
        'EIS-014',
        'EIS-016',
        'EIS-020',
      ];

      for (const code of nonRetryableCodes) {
        const error = createErrorResponse(code);
        expect(consumer.testIsRetryable(error)).toBe(false);
      }
    });

    it('should return true for retryable error codes', () => {
      const retryableCodes = ['EIS-006', 'EIS-018'];

      for (const code of retryableCodes) {
        const error = createErrorResponse(code);
        expect(consumer.testIsRetryable(error)).toBe(true);
      }
    });

    it('should return true for non-HttpException errors', () => {
      expect(consumer.testIsRetryable(new Error('connection lost'))).toBe(true);
      expect(consumer.testIsRetryable('string error')).toBe(true);
    });
  });
});
