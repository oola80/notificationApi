import { Injectable, Logger } from '@nestjs/common';
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
import { createErrorResponse } from '../common/errors.js';
import { extractValue } from '../common/utils/dot-path.util.js';
import { normalizeTimestamp } from '../common/utils/timestamp.util.js';

export interface EventProcessingInput {
  sourceId: string;
  cycleId: string;
  eventType: string;
  sourceEventId?: string;
  timestamp?: string;
  payload: Record<string, any>;
  correlationId: string;
}

export interface EventProcessingResult {
  eventId: string;
  correlationId: string;
  status: 'published' | 'duplicate';
}

@Injectable()
export class EventProcessingService {
  private readonly logger = new Logger(EventProcessingService.name);

  constructor(
    private readonly eventSourcesRepository: EventSourcesRepository,
    private readonly mappingCacheService: MappingCacheService,
    private readonly eventsRepository: EventsRepository,
    private readonly mappingEngine: MappingEngineService,
    private readonly eventTypeResolver: EventTypeResolverService,
    private readonly payloadValidator: PayloadValidatorService,
    private readonly deduplicationService: DeduplicationService,
    private readonly eventPublisher: EventPublisherService,
    private readonly metricsService: MetricsService,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  async processEvent(
    input: EventProcessingInput,
  ): Promise<EventProcessingResult> {
    const {
      sourceId,
      cycleId,
      eventType,
      sourceEventId,
      timestamp,
      payload,
      correlationId,
    } = input;

    const start = Date.now();
    const receivedAt = new Date().toISOString();
    this.metricsService.incrementReceived(sourceId);

    try {
      // Step 3: Source lookup
      const eventSource =
        await this.eventSourcesRepository.findByName(sourceId);
      if (!eventSource) {
        throw createErrorResponse('EIS-003');
      }
      if (!eventSource.isActive) {
        throw createErrorResponse('EIS-008');
      }

      // Step 3b: Per-source rate limit check
      if (eventSource.rateLimit !== null) {
        const allowed = this.rateLimiterService.checkSourceLimit(
          sourceId,
          eventSource.rateLimit,
        );
        if (!allowed) {
          throw createErrorResponse('EIS-017');
        }
      }

      // Step 4: Mapping lookup via cache (or direct DB)
      const mapping = await this.mappingCacheService.getMapping(
        sourceId,
        eventType,
      );
      if (!mapping) {
        this.metricsService.incrementMappingNotFound();
        throw createErrorResponse('EIS-014');
      }

      // Step 5: Validate — if validation schema exists
      if (mapping.validationSchema) {
        const validation = this.payloadValidator.validate(
          payload,
          mapping.validationSchema,
        );
        if (!validation.valid) {
          this.metricsService.incrementValidationError(sourceId);
          throw createErrorResponse(
            'EIS-005',
            `Validation failed: ${validation.errors.join('; ')}`,
          );
        }
      }

      // Step 6: Deduplication
      let resolvedSourceEventId = sourceEventId ?? null;
      if (!resolvedSourceEventId && mapping.sourceEventIdField) {
        const extracted = extractValue(payload, mapping.sourceEventIdField);
        if (extracted !== undefined && extracted !== null) {
          resolvedSourceEventId = String(extracted);
        }
      }

      const dedupResult = await this.deduplicationService.checkDuplicate(
        sourceId,
        resolvedSourceEventId,
      );

      if (dedupResult.isDuplicate && dedupResult.existingEvent) {
        this.metricsService.incrementDuplicate();
        return {
          eventId: dedupResult.existingEvent.eventId,
          correlationId,
          status: 'duplicate',
        };
      }

      // Step 7: Normalize
      const canonicalEventType = this.eventTypeResolver.resolve(
        eventType,
        mapping.eventTypeMapping,
      );

      const normResult = this.mappingEngine.normalizePayload(
        payload,
        mapping.fieldMappings,
      );

      if (normResult.missingRequiredFields.length > 0) {
        throw createErrorResponse(
          'EIS-016',
          `Missing required fields: ${normResult.missingRequiredFields.join(', ')}`,
        );
      }

      // Normalize timestamp
      let eventTimestamp: string;
      if (mapping.timestampField) {
        const rawTs = extractValue(payload, mapping.timestampField);
        eventTimestamp = normalizeTimestamp(
          rawTs ?? timestamp,
          mapping.timestampFormat,
        );
      } else {
        eventTimestamp = normalizeTimestamp(timestamp, mapping.timestampFormat);
      }

      const normalizedAt = new Date().toISOString();

      // Step 8: Enrich metadata
      const eventId = crypto.randomUUID();

      const normalizedPayload = {
        ...normResult.normalizedFields,
        metadata: {
          eventType: canonicalEventType,
          timestamp: eventTimestamp,
          correlationId,
          schemaVersion: '2.0',
          mappingConfigId: mapping.id,
          priority: mapping.priority,
          sourceEventId: resolvedSourceEventId,
          receivedAt,
          normalizedAt,
          warnings:
            normResult.warnings.length > 0 ? normResult.warnings : undefined,
        },
      };

      // Step 9: Persist
      const createResult = await this.eventsRepository.createEvent({
        eventId,
        sourceId,
        cycleId,
        eventType: canonicalEventType,
        sourceEventId: resolvedSourceEventId,
        rawPayload: payload,
        normalizedPayload,
        status: 'received',
        correlationId,
      });

      if (createResult.isDuplicate) {
        this.metricsService.incrementDuplicate();
        this.logger.log(
          `Duplicate event detected at persistence for source=${sourceId} sourceEventId=${resolvedSourceEventId}`,
        );
        return {
          eventId,
          correlationId,
          status: 'duplicate',
        };
      }

      const event = createResult.event!;

      // Step 10: Publish to RabbitMQ
      try {
        await this.eventPublisher.publishNormalized(
          eventId,
          correlationId,
          sourceId,
          cycleId,
          canonicalEventType,
          mapping.priority,
          normalizedPayload,
        );

        event.status = 'published';
        await this.eventsRepository.save(event);
      } catch (error) {
        event.status = 'failed';
        event.errorMessage = (error as Error).message;
        await this.eventsRepository.save(event);
        throw error;
      }

      const elapsed = Date.now() - start;
      this.metricsService.incrementPublished();
      this.metricsService.observeProcessingDuration(elapsed);

      return {
        eventId,
        correlationId,
        status: 'published',
      };
    } catch (error) {
      const elapsed = Date.now() - start;
      // Only increment failed for actual processing failures, not duplicates/validation
      const isClientError =
        error instanceof Object &&
        'getResponse' in error &&
        typeof error.getResponse === 'function';
      if (isClientError) {
        const response = error.getResponse();
        const status = response?.status;
        if (status && status >= 500) {
          this.metricsService.incrementFailed();
          this.metricsService.observeProcessingDuration(elapsed);
        }
      } else {
        this.metricsService.incrementFailed();
        this.metricsService.observeProcessingDuration(elapsed);
      }
      throw error;
    }
  }
}
