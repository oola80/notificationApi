import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AmqpConnection, Nack } from '@golevelup/nestjs-rabbitmq';
import type { ConsumeMessage } from 'amqplib';
import { EmailIngestEventConsumer } from './email-ingest-event.consumer.js';
import { EventProcessingService } from './event-processing.service.js';
import { createErrorResponse } from '../common/errors.js';

describe('EmailIngestEventConsumer', () => {
  let consumer: EmailIngestEventConsumer;
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
    sourceId: 'email-ingest',
    cycleId: 'CYCLE-003',
    eventType: 'email.received',
    payload: { from: 'user@example.com', subject: 'Test' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailIngestEventConsumer,
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

    consumer = module.get<EmailIngestEventConsumer>(EmailIngestEventConsumer);
    eventProcessingService = module.get(EventProcessingService);
    amqpConnection = module.get(AmqpConnection);

    jest.spyOn(consumer as any, 'delay').mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  describe('handleEmailIngestEvent', () => {
    it('should ACK on successful processing', async () => {
      eventProcessingService.processEvent.mockResolvedValue({
        eventId: 'evt-3',
        correlationId: 'test-corr-id',
        status: 'published',
      });

      const result = await consumer.handleEmailIngestEvent(
        validMessage,
        createAmqpMsg('source.email-ingest.email.received'),
      );

      expect(result).toBeUndefined();
    });

    it('should retry on retryable error', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        createErrorResponse('EIS-007'),
      );

      const result = await consumer.handleEmailIngestEvent(
        validMessage,
        createAmqpMsg('source.email-ingest.email.received'),
      );

      expect(result).toBeUndefined();
      expect(amqpConnection.publish).toHaveBeenCalled();
    });

    it('should Nack on non-retryable error', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        createErrorResponse('EIS-008'),
      );

      const result = await consumer.handleEmailIngestEvent(
        validMessage,
        createAmqpMsg('source.email-ingest.email.received'),
      );

      expect(result).toBeInstanceOf(Nack);
    });

    it('should Nack after max retries', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        new Error('DB timeout'),
      );

      const result = await consumer.handleEmailIngestEvent(
        validMessage,
        createAmqpMsg('source.email-ingest.email.received', {
          'x-retry-count': 3,
        }),
      );

      expect(result).toBeInstanceOf(Nack);
    });

    it('should use correct exchange for republish', async () => {
      eventProcessingService.processEvent.mockRejectedValue(
        new Error('Transient'),
      );

      await consumer.handleEmailIngestEvent(
        validMessage,
        createAmqpMsg('source.email-ingest.email.received'),
      );

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        'xch.events.incoming',
        'source.email-ingest.email.received',
        expect.any(Object),
        expect.any(Object),
      );
    });
  });
});
