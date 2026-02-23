import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { EventProcessingService } from './event-processing.service.js';
import { EventsRepository } from '../events/events.repository.js';
import { EventSourcesRepository } from '../event-sources/event-sources.repository.js';
import { MappingEngineService } from '../normalization/mapping-engine.service.js';
import { EventTypeResolverService } from '../normalization/event-type-resolver.service.js';
import { PayloadValidatorService } from '../normalization/payload-validator.service.js';
import { DeduplicationService } from '../webhook/services/deduplication.service.js';
import { EventPublisherService } from '../rabbitmq/event-publisher.service.js';
import { MappingCacheService } from '../mapping-cache/mapping-cache.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service.js';
import { EventMapping } from '../event-mappings/entities/event-mapping.entity.js';
import { EventSource } from '../event-sources/entities/event-source.entity.js';
import { Event } from '../events/entities/event.entity.js';

describe('EventProcessingService', () => {
  let service: EventProcessingService;
  let eventSourcesRepo: jest.Mocked<EventSourcesRepository>;
  let mappingCacheService: jest.Mocked<MappingCacheService>;
  let eventsRepo: jest.Mocked<EventsRepository>;
  let mappingEngine: jest.Mocked<MappingEngineService>;
  let eventTypeResolver: jest.Mocked<EventTypeResolverService>;
  let payloadValidator: jest.Mocked<PayloadValidatorService>;
  let deduplicationService: jest.Mocked<DeduplicationService>;
  let eventPublisher: jest.Mocked<EventPublisherService>;
  let metricsService: jest.Mocked<MetricsService>;
  let rateLimiterService: jest.Mocked<RateLimiterService>;

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

  const mockMapping: EventMapping = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    sourceId: 'shopify',
    eventType: 'order.created',
    name: 'Shopify Order Created',
    description: null,
    fieldMappings: { orderId: { source: 'id', target: 'orderId' } },
    eventTypeMapping: null,
    timestampField: null,
    timestampFormat: 'iso8601',
    sourceEventIdField: null,
    validationSchema: null,
    priority: 'normal',
    isActive: true,
    version: 1,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const baseInput = {
    sourceId: 'shopify',
    cycleId: 'CYCLE-001',
    eventType: 'order.created',
    payload: { id: 'ORD-123', total: 99.99 },
    correlationId: '660e8400-e29b-41d4-a716-446655440000',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventProcessingService,
        {
          provide: EventSourcesRepository,
          useValue: { findByName: jest.fn() },
        },
        {
          provide: MappingCacheService,
          useValue: { getMapping: jest.fn() },
        },
        {
          provide: EventsRepository,
          useValue: {
            createEvent: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: MappingEngineService,
          useValue: { normalizePayload: jest.fn() },
        },
        {
          provide: EventTypeResolverService,
          useValue: { resolve: jest.fn() },
        },
        {
          provide: PayloadValidatorService,
          useValue: { validate: jest.fn() },
        },
        {
          provide: DeduplicationService,
          useValue: { checkDuplicate: jest.fn() },
        },
        {
          provide: EventPublisherService,
          useValue: { publishNormalized: jest.fn() },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementReceived: jest.fn(),
            incrementPublished: jest.fn(),
            incrementFailed: jest.fn(),
            incrementDuplicate: jest.fn(),
            incrementValidationError: jest.fn(),
            incrementMappingNotFound: jest.fn(),
            observeProcessingDuration: jest.fn(),
          },
        },
        {
          provide: RateLimiterService,
          useValue: {
            checkSourceLimit: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<EventProcessingService>(EventProcessingService);
    eventSourcesRepo = module.get(EventSourcesRepository);
    mappingCacheService = module.get(MappingCacheService);
    eventsRepo = module.get(EventsRepository);
    mappingEngine = module.get(MappingEngineService);
    eventTypeResolver = module.get(EventTypeResolverService);
    payloadValidator = module.get(PayloadValidatorService);
    deduplicationService = module.get(DeduplicationService);
    eventPublisher = module.get(EventPublisherService);
    metricsService = module.get(MetricsService);
    rateLimiterService = module.get(RateLimiterService);
  });

  const setupSuccessfulPipeline = () => {
    eventSourcesRepo.findByName.mockResolvedValue(mockSource);
    mappingCacheService.getMapping.mockResolvedValue(mockMapping);
    deduplicationService.checkDuplicate.mockResolvedValue({
      isDuplicate: false,
    });
    eventTypeResolver.resolve.mockReturnValue('order.created');
    mappingEngine.normalizePayload.mockReturnValue({
      normalizedFields: { orderId: 'ORD-123' },
      warnings: [],
      missingRequiredFields: [],
    });
    const savedEvent: Event = {
      id: '1',
      eventId: 'generated-uuid',
      sourceId: 'shopify',
      cycleId: 'CYCLE-001',
      eventType: 'order.created',
      sourceEventId: null,
      rawPayload: baseInput.payload,
      normalizedPayload: {},
      status: 'received',
      errorMessage: null,
      correlationId: baseInput.correlationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    eventsRepo.createEvent.mockResolvedValue({
      event: savedEvent,
      isDuplicate: false,
    });
    eventsRepo.save.mockResolvedValue({ ...savedEvent, status: 'published' });
    eventPublisher.publishNormalized.mockResolvedValue(undefined);
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processEvent', () => {
    it('should process a valid event end-to-end and return published status', async () => {
      setupSuccessfulPipeline();

      const result = await service.processEvent(baseInput);

      expect(result.status).toBe('published');
      expect(result.correlationId).toBe(baseInput.correlationId);
      expect(result.eventId).toBeDefined();
    });

    it('should call EventPublisherService.publishNormalized', async () => {
      setupSuccessfulPipeline();

      await service.processEvent(baseInput);

      expect(eventPublisher.publishNormalized).toHaveBeenCalledWith(
        expect.any(String),
        baseInput.correlationId,
        'shopify',
        'CYCLE-001',
        'order.created',
        'normal',
        expect.objectContaining({ orderId: 'ORD-123' }),
      );
    });

    it('should throw EIS-003 when source not found', async () => {
      eventSourcesRepo.findByName.mockResolvedValue(null);

      try {
        await service.processEvent(baseInput);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-003');
      }
    });

    it('should throw EIS-008 when source is inactive', async () => {
      eventSourcesRepo.findByName.mockResolvedValue({
        ...mockSource,
        isActive: false,
      });

      try {
        await service.processEvent(baseInput);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-008');
      }
    });

    it('should throw EIS-014 when no mapping found', async () => {
      eventSourcesRepo.findByName.mockResolvedValue(mockSource);
      mappingCacheService.getMapping.mockResolvedValue(null);

      try {
        await service.processEvent(baseInput);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-014');
      }
    });

    it('should increment mappingNotFound metric when no mapping found', async () => {
      eventSourcesRepo.findByName.mockResolvedValue(mockSource);
      mappingCacheService.getMapping.mockResolvedValue(null);

      try {
        await service.processEvent(baseInput);
      } catch {
        // Expected
      }

      expect(metricsService.incrementMappingNotFound).toHaveBeenCalled();
    });

    it('should throw EIS-005 when validation fails', async () => {
      eventSourcesRepo.findByName.mockResolvedValue(mockSource);
      mappingCacheService.getMapping.mockResolvedValue({
        ...mockMapping,
        validationSchema: { type: 'object', required: ['orderId'] },
      });
      payloadValidator.validate.mockReturnValue({
        valid: false,
        errors: ['missing orderId'],
      });

      try {
        await service.processEvent(baseInput);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-005');
      }
    });

    it('should increment validationError metric when validation fails', async () => {
      eventSourcesRepo.findByName.mockResolvedValue(mockSource);
      mappingCacheService.getMapping.mockResolvedValue({
        ...mockMapping,
        validationSchema: { type: 'object', required: ['orderId'] },
      });
      payloadValidator.validate.mockReturnValue({
        valid: false,
        errors: ['missing orderId'],
      });

      try {
        await service.processEvent(baseInput);
      } catch {
        // Expected
      }

      expect(metricsService.incrementValidationError).toHaveBeenCalledWith(
        'shopify',
      );
    });

    it('should return duplicate result when dedup finds existing event', async () => {
      eventSourcesRepo.findByName.mockResolvedValue(mockSource);
      mappingCacheService.getMapping.mockResolvedValue(mockMapping);
      deduplicationService.checkDuplicate.mockResolvedValue({
        isDuplicate: true,
        existingEvent: {
          id: '1',
          eventId: 'existing-uuid',
          sourceId: 'shopify',
          cycleId: 'CYCLE-001',
          eventType: 'order.created',
          sourceEventId: 'SHP-001',
          rawPayload: {},
          normalizedPayload: {},
          status: 'published',
          errorMessage: null,
          correlationId: 'old-corr',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const result = await service.processEvent(baseInput);

      expect(result.status).toBe('duplicate');
      expect(result.eventId).toBe('existing-uuid');
    });

    it('should increment duplicate metric when dedup detects duplicate', async () => {
      eventSourcesRepo.findByName.mockResolvedValue(mockSource);
      mappingCacheService.getMapping.mockResolvedValue(mockMapping);
      deduplicationService.checkDuplicate.mockResolvedValue({
        isDuplicate: true,
        existingEvent: {
          id: '1',
          eventId: 'existing-uuid',
          sourceId: 'shopify',
          cycleId: 'CYCLE-001',
          eventType: 'order.created',
          sourceEventId: 'SHP-001',
          rawPayload: {},
          normalizedPayload: {},
          status: 'published',
          errorMessage: null,
          correlationId: 'old-corr',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      await service.processEvent(baseInput);

      expect(metricsService.incrementDuplicate).toHaveBeenCalled();
    });

    it('should throw EIS-016 when normalization fails with missing required fields', async () => {
      eventSourcesRepo.findByName.mockResolvedValue(mockSource);
      mappingCacheService.getMapping.mockResolvedValue(mockMapping);
      deduplicationService.checkDuplicate.mockResolvedValue({
        isDuplicate: false,
      });
      eventTypeResolver.resolve.mockReturnValue('order.created');
      mappingEngine.normalizePayload.mockReturnValue({
        normalizedFields: {},
        warnings: [],
        missingRequiredFields: ['orderId'],
      });

      try {
        await service.processEvent(baseInput);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('EIS-016');
      }
    });

    it('should persist event then update to published on success', async () => {
      setupSuccessfulPipeline();

      await service.processEvent(baseInput);

      expect(eventsRepo.createEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'received',
          sourceId: 'shopify',
          cycleId: 'CYCLE-001',
        }),
      );
      expect(eventsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'published' }),
      );
    });

    it('should update status to failed and rethrow on publish failure', async () => {
      eventSourcesRepo.findByName.mockResolvedValue(mockSource);
      mappingCacheService.getMapping.mockResolvedValue(mockMapping);
      deduplicationService.checkDuplicate.mockResolvedValue({
        isDuplicate: false,
      });
      eventTypeResolver.resolve.mockReturnValue('order.created');
      mappingEngine.normalizePayload.mockReturnValue({
        normalizedFields: { orderId: 'ORD-123' },
        warnings: [],
        missingRequiredFields: [],
      });
      const savedEvent: Event = {
        id: '1',
        eventId: 'generated-uuid',
        sourceId: 'shopify',
        cycleId: 'CYCLE-001',
        eventType: 'order.created',
        sourceEventId: null,
        rawPayload: baseInput.payload,
        normalizedPayload: {},
        status: 'received',
        errorMessage: null,
        correlationId: baseInput.correlationId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      eventsRepo.createEvent.mockResolvedValue({
        event: savedEvent,
        isDuplicate: false,
      });
      eventsRepo.save.mockResolvedValue(savedEvent);
      eventPublisher.publishNormalized.mockRejectedValue(
        new Error('Connection lost'),
      );

      await expect(service.processEvent(baseInput)).rejects.toThrow();

      expect(eventsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorMessage: 'Connection lost',
        }),
      );
    });

    it('should use MappingCacheService.getMapping for mapping lookup', async () => {
      setupSuccessfulPipeline();

      await service.processEvent(baseInput);

      expect(mappingCacheService.getMapping).toHaveBeenCalledWith(
        'shopify',
        'order.created',
      );
    });

    it('should increment received metric at entry', async () => {
      setupSuccessfulPipeline();

      await service.processEvent(baseInput);

      expect(metricsService.incrementReceived).toHaveBeenCalledWith('shopify');
    });

    it('should increment published metric and observe duration on success', async () => {
      setupSuccessfulPipeline();

      await service.processEvent(baseInput);

      expect(metricsService.incrementPublished).toHaveBeenCalled();
      expect(metricsService.observeProcessingDuration).toHaveBeenCalledWith(
        expect.any(Number),
      );
    });

    it('should include sourceEventId, receivedAt, and normalizedAt in metadata', async () => {
      setupSuccessfulPipeline();

      const inputWithSourceEventId = {
        ...baseInput,
        sourceEventId: 'SHP-EVT-001',
      };

      await service.processEvent(inputWithSourceEventId);

      const createEventCall = eventsRepo.createEvent.mock.calls[0][0];
      const metadata = createEventCall.normalizedPayload.metadata;

      expect(metadata.sourceEventId).toBe('SHP-EVT-001');
      expect(metadata.receivedAt).toBeDefined();
      expect(metadata.normalizedAt).toBeDefined();
      expect(typeof metadata.receivedAt).toBe('string');
      expect(typeof metadata.normalizedAt).toBe('string');
    });

    it('should set sourceEventId to null in metadata when not provided', async () => {
      setupSuccessfulPipeline();

      await service.processEvent(baseInput);

      const createEventCall = eventsRepo.createEvent.mock.calls[0][0];
      const metadata = createEventCall.normalizedPayload.metadata;

      expect(metadata.sourceEventId).toBeNull();
    });

    it('should use metadata key instead of _meta', async () => {
      setupSuccessfulPipeline();

      await service.processEvent(baseInput);

      const createEventCall = eventsRepo.createEvent.mock.calls[0][0];
      expect(createEventCall.normalizedPayload.metadata).toBeDefined();
      expect(createEventCall.normalizedPayload._meta).toBeUndefined();
    });

    it('should return duplicate when ON CONFLICT detects duplicate at persistence', async () => {
      eventSourcesRepo.findByName.mockResolvedValue(mockSource);
      mappingCacheService.getMapping.mockResolvedValue(mockMapping);
      deduplicationService.checkDuplicate.mockResolvedValue({
        isDuplicate: false,
      });
      eventTypeResolver.resolve.mockReturnValue('order.created');
      mappingEngine.normalizePayload.mockReturnValue({
        normalizedFields: { orderId: 'ORD-123' },
        warnings: [],
        missingRequiredFields: [],
      });
      eventsRepo.createEvent.mockResolvedValue({
        event: null,
        isDuplicate: true,
      });

      const result = await service.processEvent(baseInput);

      expect(result.status).toBe('duplicate');
      expect(metricsService.incrementDuplicate).toHaveBeenCalled();
      expect(eventPublisher.publishNormalized).not.toHaveBeenCalled();
    });

    describe('per-source rate limiting', () => {
      it('should throw EIS-017 when source rate limit is exceeded', async () => {
        const sourceWithRateLimit = { ...mockSource, rateLimit: 10 };
        eventSourcesRepo.findByName.mockResolvedValue(sourceWithRateLimit);
        rateLimiterService.checkSourceLimit.mockReturnValue(false);

        try {
          await service.processEvent(baseInput);
          fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(HttpException);
          const response = (error as HttpException).getResponse() as any;
          expect(response.code).toBe('EIS-017');
        }

        expect(rateLimiterService.checkSourceLimit).toHaveBeenCalledWith(
          'shopify',
          10,
        );
      });

      it('should not check source rate limit when rateLimit is null', async () => {
        setupSuccessfulPipeline();

        await service.processEvent(baseInput);

        expect(rateLimiterService.checkSourceLimit).not.toHaveBeenCalled();
      });

      it('should allow event when source rate limit is not exceeded', async () => {
        const sourceWithRateLimit = { ...mockSource, rateLimit: 100 };
        eventSourcesRepo.findByName.mockResolvedValue(sourceWithRateLimit);
        rateLimiterService.checkSourceLimit.mockReturnValue(true);
        mappingCacheService.getMapping.mockResolvedValue(mockMapping);
        deduplicationService.checkDuplicate.mockResolvedValue({
          isDuplicate: false,
        });
        eventTypeResolver.resolve.mockReturnValue('order.created');
        mappingEngine.normalizePayload.mockReturnValue({
          normalizedFields: { orderId: 'ORD-123' },
          warnings: [],
          missingRequiredFields: [],
        });
        const savedEvent: Event = {
          id: '1',
          eventId: 'generated-uuid',
          sourceId: 'shopify',
          cycleId: 'CYCLE-001',
          eventType: 'order.created',
          sourceEventId: null,
          rawPayload: baseInput.payload,
          normalizedPayload: {},
          status: 'received',
          errorMessage: null,
          correlationId: baseInput.correlationId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        eventsRepo.createEvent.mockResolvedValue({
          event: savedEvent,
          isDuplicate: false,
        });
        eventsRepo.save.mockResolvedValue({
          ...savedEvent,
          status: 'published',
        });
        eventPublisher.publishNormalized.mockResolvedValue(undefined);

        const result = await service.processEvent(baseInput);
        expect(result.status).toBe('published');
      });
    });
  });
});
