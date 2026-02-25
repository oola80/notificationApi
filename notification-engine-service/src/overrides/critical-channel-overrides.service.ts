import { Injectable, Logger } from '@nestjs/common';
import { FindOptionsWhere } from 'typeorm';
import { CriticalChannelOverridesRepository } from './critical-channel-overrides.repository.js';
import { OverrideCacheService } from './override-cache.service.js';
import { NotificationPublisherService } from '../rabbitmq/notification-publisher.service.js';
import { CriticalChannelOverride } from './entities/critical-channel-override.entity.js';
import {
  CreateOverrideDto,
  UpdateOverrideDto,
  ListOverridesQueryDto,
} from './dto/index.js';
import { createErrorResponse } from '../common/errors.js';
import { PaginatedResult } from '../common/base/pg-base.repository.js';

@Injectable()
export class CriticalChannelOverridesService {
  private readonly logger = new Logger(CriticalChannelOverridesService.name);

  constructor(
    private readonly repository: CriticalChannelOverridesRepository,
    private readonly cache: OverrideCacheService,
    private readonly notificationPublisher: NotificationPublisherService,
  ) {}

  async create(dto: CreateOverrideDto): Promise<CriticalChannelOverride> {
    const exists = await this.repository.existsActiveOverride(
      dto.eventType,
      dto.channel,
    );
    if (exists) {
      throw createErrorResponse('NES-011');
    }

    const override = await this.repository.create({
      eventType: dto.eventType,
      channel: dto.channel,
      reason: dto.reason ?? null,
      createdBy: dto.createdBy ?? null,
    });

    await this.cache.invalidate(dto.eventType);
    this.notificationPublisher.publishConfigEvent('config.override.changed', {
      eventType: dto.eventType,
      action: 'created',
    });
    this.logger.log(
      `Override created: ${override.id} (${dto.eventType}/${dto.channel})`,
    );
    return override;
  }

  async findAll(
    query: ListOverridesQueryDto,
  ): Promise<PaginatedResult<CriticalChannelOverride>> {
    const where: FindOptionsWhere<CriticalChannelOverride> = {};

    if (query.eventType !== undefined) {
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

  async findById(id: string): Promise<CriticalChannelOverride> {
    const override = await this.repository.findById(id);
    if (!override) {
      throw createErrorResponse('NES-005');
    }
    return override;
  }

  async update(
    id: string,
    dto: UpdateOverrideDto,
  ): Promise<CriticalChannelOverride> {
    const override = await this.findById(id);

    if (dto.reason !== undefined) override.reason = dto.reason ?? null;
    if (dto.isActive !== undefined) override.isActive = dto.isActive;
    if (dto.updatedBy !== undefined) override.updatedBy = dto.updatedBy ?? null;

    const updated = await this.repository.save(override);
    await this.cache.invalidate(override.eventType);
    this.notificationPublisher.publishConfigEvent('config.override.changed', {
      eventType: override.eventType,
      action: 'updated',
    });
    this.logger.log(`Override updated: ${id}`);
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const override = await this.findById(id);
    override.isActive = false;
    await this.repository.save(override);
    await this.cache.invalidate(override.eventType);
    this.notificationPublisher.publishConfigEvent('config.override.changed', {
      eventType: override.eventType,
      action: 'deleted',
    });
    this.logger.log(`Override soft-deleted: ${id}`);
  }
}
