import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationRulesRepository } from './notification-rules.repository.js';
import { NotificationRule } from './entities/notification-rule.entity.js';
import { MetricsService } from '../metrics/metrics.service.js';

@Injectable()
export class RuleCacheService implements OnModuleInit {
  private readonly logger = new Logger(RuleCacheService.name);
  private readonly cache = new Map<string, NotificationRule[]>();
  private readonly enabled: boolean;
  private lastInvalidation: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly repository: NotificationRulesRepository,
    private readonly metricsService: MetricsService,
  ) {
    this.enabled = this.config.get<boolean>('app.ruleCacheEnabled', false);
  }

  async onModuleInit(): Promise<void> {
    if (this.enabled) {
      await this.warmUp();
    }
  }

  async getRulesByEventType(eventType: string): Promise<NotificationRule[]> {
    if (!this.enabled) {
      return this.repository.findByEventType(eventType);
    }

    const cached = this.cache.get(eventType);
    if (cached) {
      return cached;
    }

    const rules = await this.repository.findByEventType(eventType);
    this.cache.set(eventType, rules);
    this.metricsService.setRuleCacheSize(this.cache.size);
    return rules;
  }

  async invalidateRule(ruleId: string, timestamp: string): Promise<void> {
    const rule = await this.repository.findById(ruleId);

    if (!rule) {
      this.logger.debug(`Rule ${ruleId} not found for invalidation, skipping`);
      return;
    }

    const cachedRules = this.cache.get(rule.eventType);
    if (cachedRules) {
      const cachedRule = cachedRules.find((r) => r.id === ruleId);
      if (
        cachedRule &&
        new Date(timestamp) <= new Date(cachedRule.updatedAt.toISOString())
      ) {
        this.logger.debug(
          `Rule ${ruleId} cache entry is newer, skipping invalidation`,
        );
        return;
      }
    }

    const rules = await this.repository.findByEventType(rule.eventType);
    this.cache.set(rule.eventType, rules);
    this.lastInvalidation = new Date().toISOString();
    this.metricsService.setRuleCacheSize(this.cache.size);
    this.logger.debug(`Rule cache invalidated for eventType=${rule.eventType}`);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async warmUp(): Promise<void> {
    this.logger.log('Warming up rule cache...');
    const allRules = await this.repository.findAllActive();

    this.cache.clear();
    for (const rule of allRules) {
      const existing = this.cache.get(rule.eventType) ?? [];
      existing.push(rule);
      this.cache.set(rule.eventType, existing);
    }

    this.lastInvalidation = new Date().toISOString();
    this.metricsService.setRuleCacheSize(this.cache.size);

    this.logger.log(
      `Rule cache warmed: ${this.cache.size} event types, ${allRules.length} rules`,
    );
  }

  get size(): number {
    return this.cache.size;
  }

  getLastInvalidation(): string | null {
    return this.lastInvalidation;
  }
}
