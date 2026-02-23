import { Injectable, Logger } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { EventMappingsRepository } from './event-mappings.repository.js';
import { EventMapping } from './entities/event-mapping.entity.js';
import { CreateEventMappingDto } from './dto/create-event-mapping.dto.js';
import { UpdateEventMappingDto } from './dto/update-event-mapping.dto.js';
import { ListEventMappingsQueryDto } from './dto/list-event-mappings-query.dto.js';
import { TestMappingDto } from './dto/test-mapping.dto.js';
import { createErrorResponse } from '../common/errors.js';
import { PaginatedResult } from '../common/base/pg-base.repository.js';
import { FindOptionsWhere } from 'typeorm';
import { MappingEngineService } from '../normalization/mapping-engine.service.js';
import { EventTypeResolverService } from '../normalization/event-type-resolver.service.js';
import { PayloadValidatorService } from '../normalization/payload-validator.service.js';
import { normalizeTimestamp } from '../common/utils/timestamp.util.js';
import { extractValue } from '../common/utils/dot-path.util.js';
import { EXCHANGE_CONFIG_EVENTS } from '../rabbitmq/rabbitmq.constants.js';

@Injectable()
export class EventMappingsService {
  private readonly logger = new Logger(EventMappingsService.name);

  constructor(
    private readonly repository: EventMappingsRepository,
    private readonly mappingEngine: MappingEngineService,
    private readonly eventTypeResolver: EventTypeResolverService,
    private readonly payloadValidator: PayloadValidatorService,
    private readonly amqpConnection: AmqpConnection,
  ) {}

  async findAll(
    query: ListEventMappingsQueryDto,
  ): Promise<PaginatedResult<EventMapping>> {
    const where: FindOptionsWhere<EventMapping> = {};

    if (query.sourceId) {
      where.sourceId = query.sourceId;
    }
    if (query.eventType) {
      where.eventType = query.eventType;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return this.repository.findWithPagination({
      where,
      page: query.page,
      limit: query.limit,
      order: { createdAt: 'DESC' },
    });
  }

  async findById(id: string): Promise<EventMapping> {
    const mapping = await this.repository.findById(id);
    if (!mapping) {
      throw createErrorResponse('EIS-002');
    }
    return mapping;
  }

  async create(dto: CreateEventMappingDto): Promise<EventMapping> {
    const conflict = await this.repository.existsActiveMapping(
      dto.sourceId,
      dto.eventType,
    );
    if (conflict) {
      throw createErrorResponse('EIS-009');
    }

    const mapping = await this.repository.create({
      sourceId: dto.sourceId,
      eventType: dto.eventType,
      name: dto.name,
      description: dto.description ?? null,
      fieldMappings: dto.fieldMappings,
      eventTypeMapping: dto.eventTypeMapping ?? null,
      timestampField: dto.timestampField ?? null,
      timestampFormat: dto.timestampFormat ?? 'iso8601',
      sourceEventIdField: dto.sourceEventIdField ?? null,
      validationSchema: dto.validationSchema ?? null,
      priority: dto.priority ?? 'normal',
      createdBy: dto.createdBy ?? null,
    });

    await this.publishMappingChanged(mapping.id, mapping.version);

    return mapping;
  }

  async update(id: string, dto: UpdateEventMappingDto): Promise<EventMapping> {
    const mapping = await this.repository.findById(id);
    if (!mapping) {
      throw createErrorResponse('EIS-002');
    }

    if (dto.name !== undefined) mapping.name = dto.name;
    if (dto.description !== undefined)
      mapping.description = dto.description ?? null;
    if (dto.fieldMappings !== undefined)
      mapping.fieldMappings = dto.fieldMappings;
    if (dto.eventTypeMapping !== undefined)
      mapping.eventTypeMapping = dto.eventTypeMapping ?? null;
    if (dto.timestampField !== undefined)
      mapping.timestampField = dto.timestampField ?? null;
    if (dto.timestampFormat !== undefined)
      mapping.timestampFormat = dto.timestampFormat ?? 'iso8601';
    if (dto.sourceEventIdField !== undefined)
      mapping.sourceEventIdField = dto.sourceEventIdField ?? null;
    if (dto.validationSchema !== undefined)
      mapping.validationSchema = dto.validationSchema ?? null;
    if (dto.priority !== undefined) mapping.priority = dto.priority ?? 'normal';
    if (dto.updatedBy !== undefined) mapping.updatedBy = dto.updatedBy ?? null;

    mapping.version = mapping.version + 1;

    const saved = await this.repository.save(mapping);

    await this.publishMappingChanged(saved.id, saved.version);

    return saved;
  }

  async softDelete(id: string): Promise<EventMapping> {
    const mapping = await this.repository.findById(id);
    if (!mapping) {
      throw createErrorResponse('EIS-002');
    }

    mapping.isActive = false;
    const saved = await this.repository.save(mapping);

    await this.publishMappingChanged(saved.id, saved.version);

    return saved;
  }

  async testMapping(id: string, dto: TestMappingDto) {
    const mapping = await this.repository.findById(id);
    if (!mapping) {
      throw createErrorResponse('EIS-002');
    }

    const warnings: string[] = [];

    // Validate (include as warnings, don't reject)
    if (mapping.validationSchema) {
      const validation = this.payloadValidator.validate(
        dto.samplePayload,
        mapping.validationSchema,
      );
      if (!validation.valid) {
        warnings.push(...validation.errors.map((e) => `Validation: ${e}`));
      }
    }

    // Resolve event type
    const eventType = dto.eventType ?? mapping.eventType;
    const canonicalEventType = this.eventTypeResolver.resolve(
      eventType,
      mapping.eventTypeMapping,
    );

    // Run mapping engine
    const normResult = this.mappingEngine.normalizePayload(
      dto.samplePayload,
      mapping.fieldMappings,
    );
    warnings.push(...normResult.warnings);

    // Normalize timestamp
    let eventTimestamp: string;
    if (mapping.timestampField) {
      const rawTs = extractValue(dto.samplePayload, mapping.timestampField);
      eventTimestamp = normalizeTimestamp(rawTs, mapping.timestampFormat);
    } else {
      eventTimestamp = normalizeTimestamp(null, mapping.timestampFormat);
    }

    const canonicalEvent = {
      ...normResult.normalizedFields,
      metadata: {
        eventType: canonicalEventType,
        timestamp: eventTimestamp,
        schemaVersion: '2.0',
        mappingConfigId: mapping.id,
        priority: mapping.priority,
      },
    };

    return {
      canonicalEvent,
      warnings,
      missingRequiredFields: normResult.missingRequiredFields,
    };
  }

  private async publishMappingChanged(
    id: string,
    version: number,
  ): Promise<void> {
    try {
      await this.amqpConnection.publish(
        EXCHANGE_CONFIG_EVENTS,
        'config.mapping.changed',
        { id, version },
        {
          persistent: true,
          contentType: 'application/json',
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to publish mapping change event for ${id}: ${(error as Error).message}`,
      );
    }
  }
}
