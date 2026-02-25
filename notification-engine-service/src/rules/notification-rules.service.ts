import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FindOptionsWhere } from 'typeorm';
import { NotificationRulesRepository } from './notification-rules.repository.js';
import { NotificationPublisherService } from '../rabbitmq/notification-publisher.service.js';
import { NotificationRule } from './entities/notification-rule.entity.js';
import {
  CreateRuleDto,
  UpdateRuleDto,
  ListRulesQueryDto,
} from './dto/index.js';
import { createErrorResponse } from '../common/errors.js';
import { PaginatedResult } from '../common/base/pg-base.repository.js';

@Injectable()
export class NotificationRulesService {
  private readonly logger = new Logger(NotificationRulesService.name);

  constructor(
    private readonly repository: NotificationRulesRepository,
    private readonly notificationPublisher: NotificationPublisherService,
    private readonly configService: ConfigService,
  ) {}

  async create(dto: CreateRuleDto): Promise<NotificationRule> {
    const duplicate = await this.repository.existsActiveDuplicate(
      dto.eventType,
      dto.conditions ?? null,
    );

    if (duplicate) {
      throw createErrorResponse('NES-006');
    }

    const rule = await this.repository.create({
      name: dto.name,
      eventType: dto.eventType,
      actions: dto.actions,
      conditions: dto.conditions ?? null,
      suppression: dto.suppression ?? null,
      deliveryPriority: dto.deliveryPriority ?? null,
      priority: dto.priority ?? 100,
      isExclusive: dto.isExclusive ?? false,
      createdBy: dto.createdBy ?? null,
    });

    this.publishRuleChanged(rule, 'created');
    this.logger.log(`Rule created: ${rule.id} (${rule.name})`);
    return rule;
  }

  async findAll(
    query: ListRulesQueryDto,
  ): Promise<PaginatedResult<NotificationRule>> {
    const where: FindOptionsWhere<NotificationRule> = {};

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

  async findById(id: string): Promise<NotificationRule> {
    const rule = await this.repository.findById(id);

    if (!rule) {
      throw createErrorResponse('NES-002');
    }

    return rule;
  }

  async update(id: string, dto: UpdateRuleDto): Promise<NotificationRule> {
    const rule = await this.findById(id);

    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.actions !== undefined) rule.actions = dto.actions;
    if (dto.conditions !== undefined) rule.conditions = dto.conditions ?? null;
    if (dto.suppression !== undefined)
      rule.suppression = dto.suppression ?? null;
    if (dto.deliveryPriority !== undefined)
      rule.deliveryPriority = dto.deliveryPriority ?? null;
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if (dto.isExclusive !== undefined) rule.isExclusive = dto.isExclusive;
    if (dto.updatedBy !== undefined) rule.updatedBy = dto.updatedBy;

    const updated = await this.repository.save(rule);
    this.publishRuleChanged(updated, 'updated');
    this.logger.log(`Rule updated: ${updated.id}`);
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const rule = await this.findById(id);
    rule.isActive = false;
    const saved = await this.repository.save(rule);
    this.publishRuleChanged(saved, 'deleted');
    this.logger.log(`Rule soft-deleted: ${id}`);
  }

  private publishRuleChanged(rule: NotificationRule, action: string): void {
    if (this.configService.get<boolean>('app.ruleCacheEnabled', false)) {
      this.notificationPublisher.publishConfigEvent('config.rule.changed', {
        ruleId: rule.id,
        timestamp: rule.updatedAt.toISOString(),
        action,
      });
    }
  }
}
