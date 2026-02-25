import { Test, TestingModule } from '@nestjs/testing';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { ConfigService } from '@nestjs/config';
import { NormalEventConsumer } from './normal-event.consumer.js';
import { EventProcessingPipelineService } from './event-processing-pipeline.service.js';
import { NormalizedEventMessage } from '../rabbitmq/interfaces/normalized-event-message.interface.js';

describe('NormalEventConsumer', () => {
  let consumer: NormalEventConsumer;
  let pipeline: jest.Mocked<EventProcessingPipelineService>;
  let amqpConnection: jest.Mocked<AmqpConnection>;

  const mockMessage: NormalizedEventMessage = {
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    correlationId: 'corr-123',
    sourceId: 'src-1',
    cycleId: 'cycle-1',
    eventType: 'shipment.shipped',
    priority: 'normal',
    normalizedPayload: { trackingNumber: 'TRK-999' },
    publishedAt: '2026-01-01T00:00:00Z',
  };

  const mockAmqpMsg = {
    fields: { routingKey: 'event.normal.shipment.shipped' },
    properties: { headers: {} },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NormalEventConsumer,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, def?: any) => {
              const map: Record<string, any> = {
                'rabbitmq.dlqMaxRetries': 3,
                'rabbitmq.retryInitialDelayMs': 1000,
                'rabbitmq.retryBackoffMultiplier': 2,
                'rabbitmq.retryMaxDelayMs': 30000,
              };
              return map[key] ?? def;
            }),
          },
        },
        {
          provide: AmqpConnection,
          useValue: { publish: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EventProcessingPipelineService,
          useValue: { processEvent: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    consumer = module.get<NormalEventConsumer>(NormalEventConsumer);
    pipeline = module.get(EventProcessingPipelineService);
    amqpConnection = module.get(AmqpConnection);

    jest.spyOn(consumer as any, 'delay').mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should delegate to pipeline on success', async () => {
    await consumer.handleNormalEvent(mockMessage, mockAmqpMsg);

    expect(pipeline.processEvent).toHaveBeenCalledWith(mockMessage);
  });

  it('should return undefined (ACK) on success', async () => {
    const result = await consumer.handleNormalEvent(mockMessage, mockAmqpMsg);

    expect(result).toBeUndefined();
  });

  it('should call retryOrDlq on pipeline error', async () => {
    const error = new Error('Processing failed');
    pipeline.processEvent.mockRejectedValue(error);

    const retrySpy = jest.spyOn(consumer as any, 'retryOrDlq');
    await consumer.handleNormalEvent(mockMessage, mockAmqpMsg);

    expect(retrySpy).toHaveBeenCalledWith(mockMessage, mockAmqpMsg, error);
  });

  it('should republish on retryable error', async () => {
    pipeline.processEvent.mockRejectedValue(new Error('timeout'));

    await consumer.handleNormalEvent(mockMessage, mockAmqpMsg);

    expect(amqpConnection.publish).toHaveBeenCalled();
  });
});
