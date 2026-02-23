import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service.js';
import { EventProcessingService } from '../consumers/event-processing.service.js';
import { EventSource } from '../event-sources/entities/event-source.entity.js';

describe('WebhookService', () => {
  let service: WebhookService;
  let eventProcessingService: jest.Mocked<EventProcessingService>;

  const mockSource: EventSource = {
    id: 1,
    name: 'shopify',
    displayName: 'Shopify',
    type: 'webhook',
    connectionConfig: null,
    apiKeyHash: 'hash',
    signingSecretHash: null,
    isActive: true,
    rateLimit: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: EventProcessingService,
          useValue: { processEvent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    eventProcessingService = module.get(EventProcessingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processWebhookEvent', () => {
    const dto = {
      sourceId: 'shopify',
      cycleId: 'CYCLE-001',
      eventType: 'order.created',
      payload: { id: 'ORD-123', total: 99.99 },
    };
    const correlationId = '660e8400-e29b-41d4-a716-446655440000';

    it('should delegate to EventProcessingService.processEvent', async () => {
      eventProcessingService.processEvent.mockResolvedValue({
        eventId: 'evt-1',
        correlationId,
        status: 'published',
      });

      const result = await service.processWebhookEvent(
        dto,
        mockSource,
        correlationId,
      );

      expect(result.status).toBe('published');
      expect(result.eventId).toBe('evt-1');
      expect(eventProcessingService.processEvent).toHaveBeenCalledTimes(1);
    });

    it('should construct EventProcessingInput correctly from dto', async () => {
      eventProcessingService.processEvent.mockResolvedValue({
        eventId: 'evt-2',
        correlationId,
        status: 'published',
      });

      const dtoWithOptionals = {
        ...dto,
        sourceEventId: 'SHP-001',
        timestamp: '2026-01-01T00:00:00Z',
      };

      await service.processWebhookEvent(
        dtoWithOptionals,
        mockSource,
        correlationId,
      );

      expect(eventProcessingService.processEvent).toHaveBeenCalledWith({
        sourceId: 'shopify',
        cycleId: 'CYCLE-001',
        eventType: 'order.created',
        sourceEventId: 'SHP-001',
        timestamp: '2026-01-01T00:00:00Z',
        payload: { id: 'ORD-123', total: 99.99 },
        correlationId,
      });
    });

    it('should propagate errors from EventProcessingService', async () => {
      const error = new Error('Processing failed');
      eventProcessingService.processEvent.mockRejectedValue(error);

      await expect(
        service.processWebhookEvent(dto, mockSource, correlationId),
      ).rejects.toThrow('Processing failed');
    });
  });
});
