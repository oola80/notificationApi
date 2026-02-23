import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { EventsRepository } from './events.repository.js';
import { Event } from './entities/event.entity.js';

describe('EventsService', () => {
  let service: EventsService;
  let repository: jest.Mocked<EventsRepository>;

  const mockEvent: Event = {
    id: '1',
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    sourceId: 'shopify',
    cycleId: 'CYCLE-001',
    eventType: 'order.created',
    sourceEventId: 'SHP-EVT-001',
    rawPayload: { orderId: '123' },
    normalizedPayload: { orderId: '123' },
    status: 'published',
    errorMessage: null,
    correlationId: '660e8400-e29b-41d4-a716-446655440000',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepository = {
      findById: jest.fn(),
      findByEventId: jest.fn(),
      findWithPagination: jest.fn(),
      findDuplicate: jest.fn(),
      createEvent: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: EventsRepository, useValue: mockRepository },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    repository = module.get(EventsRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findByEventId', () => {
    it('should return the event when found', async () => {
      repository.findByEventId.mockResolvedValue(mockEvent);

      const result = await service.findByEventId(mockEvent.eventId);
      expect(result).toEqual(mockEvent);
    });

    it('should throw EIS-015 when not found', async () => {
      repository.findByEventId.mockResolvedValue(null);

      try {
        await service.findByEventId('nonexistent');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-015');
      }
    });
  });

  describe('findAll', () => {
    it('should return paginated results with filters', async () => {
      const result = { data: [mockEvent], total: 1, page: 1, limit: 50 };
      repository.findWithPagination.mockResolvedValue(result);

      const response = await service.findAll({
        sourceId: 'shopify',
        status: 'published',
        page: 1,
        limit: 50,
      });

      expect(response).toEqual(result);
      expect(repository.findWithPagination).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceId: 'shopify',
            status: 'published',
          }),
        }),
      );
    });
  });

  describe('createEvent', () => {
    it('should delegate to repository and return CreateEventResult', async () => {
      repository.createEvent.mockResolvedValue({
        event: mockEvent,
        isDuplicate: false,
      });

      const result = await service.createEvent({ sourceId: 'shopify' });
      expect(result).toEqual({ event: mockEvent, isDuplicate: false });
    });
  });

  describe('updateStatus', () => {
    it('should update event status', async () => {
      repository.findByEventId.mockResolvedValue({ ...mockEvent });
      repository.save.mockImplementation(async (entity) => entity);

      const result = await service.updateStatus(
        mockEvent.eventId,
        'failed',
        'Some error',
      );

      expect(result.status).toBe('failed');
      expect(result.errorMessage).toBe('Some error');
    });

    it('should throw EIS-015 when event not found', async () => {
      repository.findByEventId.mockResolvedValue(null);

      try {
        await service.updateStatus('nonexistent', 'failed');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-015');
      }
    });
  });
});
