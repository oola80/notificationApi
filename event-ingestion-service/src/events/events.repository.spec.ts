import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventsRepository } from './events.repository.js';
import { Event } from './entities/event.entity.js';

describe('EventsRepository', () => {
  let repo: EventsRepository;

  const mockEvent: Event = {
    id: '1',
    eventId: 'aabbccdd-1234-5678-abcd-ef0123456789',
    sourceId: 'shopify',
    cycleId: 'cycle-001',
    eventType: 'order.created',
    sourceEventId: 'src-evt-001',
    rawPayload: { id: '123' },
    normalizedPayload: { orderId: '123' },
    status: 'published',
    errorMessage: null,
    correlationId: 'corr-001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };

  const mockTypeOrmRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsRepository,
        {
          provide: getRepositoryToken(Event),
          useValue: mockTypeOrmRepo,
        },
      ],
    }).compile();

    repo = module.get<EventsRepository>(EventsRepository);
  });

  describe('createEvent', () => {
    it('should create event without sourceEventId using create+save', async () => {
      const data = { ...mockEvent, sourceEventId: undefined };
      const entity = { ...mockEvent, sourceEventId: null };
      mockTypeOrmRepo.create.mockReturnValue(entity);
      mockTypeOrmRepo.save.mockResolvedValue(entity);

      const result = await repo.createEvent(data);

      expect(result.isDuplicate).toBe(false);
      expect(result.event).toEqual(entity);
      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith(data);
      expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(entity);
    });

    it('should return isDuplicate: true when ON CONFLICT returns empty', async () => {
      mockTypeOrmRepo.query.mockResolvedValue([]);

      const result = await repo.createEvent({
        eventId: mockEvent.eventId,
        sourceId: mockEvent.sourceId,
        cycleId: mockEvent.cycleId,
        eventType: mockEvent.eventType,
        sourceEventId: 'src-evt-001',
        rawPayload: mockEvent.rawPayload,
        normalizedPayload: mockEvent.normalizedPayload,
        status: mockEvent.status,
        correlationId: mockEvent.correlationId,
      });

      expect(result.isDuplicate).toBe(true);
      expect(result.event).toBeNull();
    });
  });

  describe('findByEventId', () => {
    it('should return event when found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(mockEvent);

      const result = await repo.findByEventId(mockEvent.eventId);

      expect(result).toEqual(mockEvent);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { eventId: mockEvent.eventId },
      });
    });

    it('should return null for missing event', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);

      const result = await repo.findByEventId('nonexistent-uuid');

      expect(result).toBeNull();
    });
  });

  describe('findDuplicate', () => {
    it('should return event within dedup window', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(mockEvent);

      const result = await repo.findDuplicate('shopify', 'src-evt-001', 24);

      expect(result).toEqual(mockEvent);
      expect(mockTypeOrmRepo.createQueryBuilder).toHaveBeenCalledWith('event');
    });

    it('should return null when no duplicate found', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      const result = await repo.findDuplicate('shopify', 'src-evt-001', 24);

      expect(result).toBeNull();
    });
  });
});
