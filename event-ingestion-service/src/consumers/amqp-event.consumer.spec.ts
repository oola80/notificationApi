import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import type { ConsumeMessage } from 'amqplib';
import { AmqpEventConsumer } from './amqp-event.consumer.js';
import { EventProcessingService } from './event-processing.service.js';
import { createErrorResponse } from '../common/errors.js';

describe('AmqpEventConsumer', () => {
  let consumer: AmqpEventConsumer;
  let eventProcessingService: jest.Mocked<EventProcessingService>;
  let amqpConnection: jest.Mocked<AmqpConnection>;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        'rabbitmq.dlqMaxRetries': 3,
        'rabbitmq.retryInitialDelayMs': 10,
        'rabbitmq.retryBackoffMultiplier': 2,
        'rabbitmq.retryMaxDelayMs': 100,
      };
      return config[key] ?? defaultValue;
    }),
  };

  const createAmqpMsg = (
    routingKey: string,
    headers: Record<string, any> = {},
  ): ConsumeMessage =>
    ({
      fields: { routingKey },
      properties: {
        correlationId: 'test-corr-id',
        headers,
      },
    }) as unknown as ConsumeMessage;

  const validMessage = {
    sourceId: 'shopify',
    cycleId: 'CYCLE-001',
    eventType: 'order.created',
    payload: { id: 'ORD-123' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmqpEventConsumer,
        {
          provide: EventProcessingService,
          useValue: { processEvent: jest.fn() },
        },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: AmqpConnection,
          useValue: { publish: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    consumer = module.get<AmqpEventConsumer>(AmqpEventConsumer);
    eventProcessingService = module.get(EventProcessingService);
    amqpConnection = module.get(AmqpConnection);

    // Stub delay to avoid real timeouts
    jest.spyOn(consumer as any, 'delay').mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  describe('handleAmqpEvent', () => {
    it('should ACK on successful processing (return void)', async () => {
      eventProcessingService.processEvent.mockResolvedValue({
        eventId: 'evt-1',
        correlationId: 'test-corr-id',
        status: 'published',
      });

      const result = await consumer.handleAmqpEvent(
        validMessage,
        createAmqpMsg('source.shopify.order.created'),
      );

      expect(result).toBeUndefined();
      expect(eventProcessingService.processEvent).toHaveBeenCalled();
    });

    it('should retry on retryable error and republish with incremented count', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        createErrorResponse('EIS-018'),
      );

      const result = await consumer.handleAmqpEvent(
        validMessage,
        createAmqpMsg('source.shopify.order.created', {
          'x-retry-count': 0,
        }),
      );

      // Returns void = ACK original (republished)
      expect(result).toBeUndefined();
      expect(amqpConnection.publish).toHaveBeenCalledWith(
        'xch.events.incoming',
        'source.shopify.order.created',
        validMessage,
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-retry-count': 1 }),
        }),
      );
    });

    it('should Nack to DLQ after max retries exceeded', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        createErrorResponse('EIS-018'),
      );

      const result = await consumer.handleAmqpEvent(
        validMessage,
        createAmqpMsg('source.shopify.order.created', {
          'x-retry-count': 3,
        }),
      );

      expect(result).toBeInstanceOf(Nack);
      expect(amqpConnection.publish).not.toHaveBeenCalled();
    });

    it('should Nack immediately on non-retryable error (EIS-003)', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        createErrorResponse('EIS-003'),
      );

      const result = await consumer.handleAmqpEvent(
        validMessage,
        createAmqpMsg('source.shopify.order.created'),
      );

      expect(result).toBeInstanceOf(Nack);
      expect(amqpConnection.publish).not.toHaveBeenCalled();
    });

    it('should Nack immediately on non-retryable error (EIS-005)', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        createErrorResponse('EIS-005'),
      );

      const result = await consumer.handleAmqpEvent(
        validMessage,
        createAmqpMsg('source.shopify.order.created'),
      );

      expect(result).toBeInstanceOf(Nack);
    });

    it('should Nack immediately on non-retryable error (EIS-014)', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        createErrorResponse('EIS-014'),
      );

      const result = await consumer.handleAmqpEvent(
        validMessage,
        createAmqpMsg('source.shopify.order.created'),
      );

      expect(result).toBeInstanceOf(Nack);
    });

    it('should retry on unknown errors', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        new Error('Random failure'),
      );

      const result = await consumer.handleAmqpEvent(
        validMessage,
        createAmqpMsg('source.shopify.order.created'),
      );

      // Should republish (retry)
      expect(result).toBeUndefined();
      expect(amqpConnection.publish).toHaveBeenCalled();
    });

    it('should Nack on invalid routing key', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        createErrorResponse('EIS-020'),
      );

      const result = await consumer.handleAmqpEvent(
        validMessage,
        createAmqpMsg('invalid.key'),
      );

      expect(result).toBeInstanceOf(Nack);
    });
  });
});
