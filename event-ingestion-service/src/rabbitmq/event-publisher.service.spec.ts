import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EventPublisherService } from './event-publisher.service.js';
import { EXCHANGE_EVENTS_NORMALIZED } from './rabbitmq.constants.js';

describe('EventPublisherService', () => {
  let service: EventPublisherService;
  let amqpConnection: jest.Mocked<AmqpConnection>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventPublisherService,
        {
          provide: AmqpConnection,
          useValue: {
            publish: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<EventPublisherService>(EventPublisherService);
    amqpConnection = module.get(AmqpConnection);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publishNormalized', () => {
    const eventId = '550e8400-e29b-41d4-a716-446655440001';
    const correlationId = '660e8400-e29b-41d4-a716-446655440000';
    const sourceId = 'shopify';
    const cycleId = 'CYCLE-001';
    const eventType = 'order.created';
    const priority = 'normal';
    const normalizedPayload = { orderId: 'ORD-123' };

    it('should publish to the correct exchange with correct routing key', async () => {
      await service.publishNormalized(
        eventId,
        correlationId,
        sourceId,
        cycleId,
        eventType,
        priority,
        normalizedPayload,
      );

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_EVENTS_NORMALIZED,
        'event.normal.order.created',
        expect.objectContaining({
          eventId,
          correlationId,
          sourceId,
          cycleId,
          eventType,
          priority,
          normalizedPayload,
        }),
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
          messageId: eventId,
          correlationId,
        }),
      );
    });

    it('should include custom headers', async () => {
      await service.publishNormalized(
        eventId,
        correlationId,
        sourceId,
        cycleId,
        eventType,
        priority,
        normalizedPayload,
      );

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: {
            'x-source-id': sourceId,
            'x-event-type': eventType,
            'x-priority': priority,
          },
        }),
      );
    });

    it('should use critical priority routing key', async () => {
      await service.publishNormalized(
        eventId,
        correlationId,
        sourceId,
        cycleId,
        eventType,
        'critical',
        normalizedPayload,
      );

      expect(amqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_EVENTS_NORMALIZED,
        'event.critical.order.created',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should include publishedAt timestamp in message', async () => {
      await service.publishNormalized(
        eventId,
        correlationId,
        sourceId,
        cycleId,
        eventType,
        priority,
        normalizedPayload,
      );

      const publishedMessage = amqpConnection.publish.mock.calls[0][2];
      expect(publishedMessage.publishedAt).toBeDefined();
      expect(() => new Date(publishedMessage.publishedAt)).not.toThrow();
    });

    it('should throw EIS-018 on publish failure', async () => {
      amqpConnection.publish.mockRejectedValue(new Error('Connection lost'));

      try {
        await service.publishNormalized(
          eventId,
          correlationId,
          sourceId,
          cycleId,
          eventType,
          priority,
          normalizedPayload,
        );
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-018');
      }
    });

    it('should set persistent delivery mode', async () => {
      await service.publishNormalized(
        eventId,
        correlationId,
        sourceId,
        cycleId,
        eventType,
        priority,
        normalizedPayload,
      );

      const options = amqpConnection.publish.mock.calls[0][3];
      expect(options?.persistent).toBe(true);
    });
  });
});
