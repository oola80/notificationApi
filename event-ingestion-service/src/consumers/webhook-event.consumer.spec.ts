import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import type { ConsumeMessage } from 'amqplib';
import { WebhookEventConsumer } from './webhook-event.consumer.js';
import { EventProcessingService } from './event-processing.service.js';
import { createErrorResponse } from '../common/errors.js';

describe('WebhookEventConsumer', () => {
  let consumer: WebhookEventConsumer;
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
    sourceId: 'webhook',
    cycleId: 'CYCLE-002',
    eventType: 'order.shipped',
    payload: { orderId: 'ORD-456' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookEventConsumer,
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

    consumer = module.get<WebhookEventConsumer>(WebhookEventConsumer);
    eventProcessingService = module.get(EventProcessingService);
    amqpConnection = module.get(AmqpConnection);

    jest.spyOn(consumer as any, 'delay').mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  describe('handleWebhookEvent', () => {
    it('should ACK on successful processing', async () => {
      eventProcessingService.processEvent.mockResolvedValue({
        eventId: 'evt-2',
        correlationId: 'test-corr-id',
        status: 'published',
      });

      const result = await consumer.handleWebhookEvent(
        validMessage,
        createAmqpMsg('source.webhook.order.shipped'),
      );

      expect(result).toBeUndefined();
    });

    it('should retry on retryable error', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        createErrorResponse('EIS-006'),
      );

      const result = await consumer.handleWebhookEvent(
        validMessage,
        createAmqpMsg('source.webhook.order.shipped'),
      );

      expect(result).toBeUndefined();
      expect(amqpConnection.publish).toHaveBeenCalled();
    });

    it('should Nack on non-retryable error', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        createErrorResponse('EIS-016'),
      );

      const result = await consumer.handleWebhookEvent(
        validMessage,
        createAmqpMsg('source.webhook.order.shipped'),
      );

      expect(result).toBeInstanceOf(Nack);
    });

    it('should Nack after max retries', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        createErrorResponse('EIS-018'),
      );

      const result = await consumer.handleWebhookEvent(
        validMessage,
        createAmqpMsg('source.webhook.order.shipped', {
          'x-retry-count': 3,
        }),
      );

      expect(result).toBeInstanceOf(Nack);
    });

    it('should use correct exchange for republish', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        new Error('Transient failure'),
      );

      await consumer.handleWebhookEvent(
        validMessage,
        createAmqpMsg('source.webhook.order.shipped'),
      );

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        'xch.events.incoming',
        'source.webhook.order.shipped',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });
});
