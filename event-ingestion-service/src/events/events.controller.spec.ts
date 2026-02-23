import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller.js';
import { EventsService } from './events.service.js';
import { Event } from './entities/event.entity.js';

describe('EventsController', () => {
  let controller: EventsController;
  let service: jest.Mocked<EventsService>;

  const mockEvent: Event = {
    id: '1',
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    sourceId: 'shopify',
    cycleId: 'CYCLE-001',
    eventType: 'order.created',
    sourceEventId: null,
    rawPayload: { orderId: '123' },
    normalizedPayload: null,
    status: 'received',
    errorMessage: null,
    correlationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockService = {
      findAll: jest.fn(),
      findByEventId: jest.fn(),
      createEvent: jest.fn(),
      updateStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: mockService }],
    }).compile();

    controller = module.get<EventsController>(EventsController);
    service = module.get(EventsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should delegate to service.findAll', async () => {
      const result = { data: [mockEvent], total: 1, page: 1, limit: 50 };
      service.findAll.mockResolvedValue(result);

      const query = { page: 1, limit: 50 };
      expect(await controller.findAll(query)).toEqual(result);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findByEventId', () => {
    it('should delegate to service.findByEventId', async () => {
      service.findByEventId.mockResolvedValue(mockEvent);

      expect(await controller.findByEventId(mockEvent.eventId)).toEqual(
        mockEvent,
      );
      expect(service.findByEventId).toHaveBeenCalledWith(mockEvent.eventId);
    });
  });
});
