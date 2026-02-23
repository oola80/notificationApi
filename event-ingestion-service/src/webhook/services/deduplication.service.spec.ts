import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeduplicationService } from './deduplication.service.js';
import { EventsRepository } from '../../events/events.repository.js';
import { Event } from '../../events/entities/event.entity.js';

describe('DeduplicationService', () => {
  let service: DeduplicationService;
  let eventsRepository: jest.Mocked<EventsRepository>;

  const mockEvent: Event = {
    id: '1',
    eventId: '550e8400-e29b-41d4-a716-446655440000',
    sourceId: 'shopify',
    cycleId: 'CYCLE-001',
    eventType: 'order.created',
    sourceEventId: 'SHP-001',
    rawPayload: {},
    normalizedPayload: null,
    status: 'published',
    errorMessage: null,
    correlationId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockEventsRepo = {
      findDuplicate: jest.fn(),
      findById: jest.fn(),
      findByEventId: jest.fn(),
      findWithPagination: jest.fn(),
      createEvent: jest.fn(),
      save: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue(24),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeduplicationService,
        { provide: EventsRepository, useValue: mockEventsRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<DeduplicationService>(DeduplicationService);
    eventsRepository = module.get(EventsRepository);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should skip check when sourceEventId is null', async () => {
    const result = await service.checkDuplicate('shopify', null);
    expect(result.isDuplicate).toBe(false);
    expect(eventsRepository.findDuplicate).not.toHaveBeenCalled();
  });

  it('should skip check when sourceEventId is empty string', async () => {
    const result = await service.checkDuplicate('shopify', '');
    expect(result.isDuplicate).toBe(false);
    expect(eventsRepository.findDuplicate).not.toHaveBeenCalled();
  });

  it('should return isDuplicate true when existing event found', async () => {
    eventsRepository.findDuplicate.mockResolvedValue(mockEvent);

    const result = await service.checkDuplicate('shopify', 'SHP-001');

    expect(result.isDuplicate).toBe(true);
    expect(result.existingEvent).toEqual(mockEvent);
    expect(eventsRepository.findDuplicate).toHaveBeenCalledWith(
      'shopify',
      'SHP-001',
      24,
    );
  });

  it('should return isDuplicate false when no existing event found', async () => {
    eventsRepository.findDuplicate.mockResolvedValue(null);

    const result = await service.checkDuplicate('shopify', 'SHP-NEW');
    expect(result.isDuplicate).toBe(false);
  });
});
