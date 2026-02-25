import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CriticalChannelOverridesRepository } from './critical-channel-overrides.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';

@Injectable()
export class OverrideCacheService implements OnModuleInit {
  private readonly overrideMap = new Map<string, string[]>();
  private readonly enabled: boolean;

  constructor(
    private readonly config: ConfigService,
    private readonly repository: CriticalChannelOverridesRepository,
    private readonly metricsService: MetricsService,
  ) {
    this.enabled = this.config.get<boolean>('app.overrideCacheEnabled', true);
  }

  async onModuleInit(): Promise<void> {
    if (this.enabled) {
      await this.refresh();
    }
  }

  getOverrides(eventType: string): string[] {
    if (!this.enabled) {
      return [];
    }
    return this.overrideMap.get(eventType) ?? [];
  }

  async refresh(): Promise<void> {
    const overrides = await this.repository.findAllActive();
    this.overrideMap.clear();

    for (const override of overrides) {
      const existing = this.overrideMap.get(override.eventType) ?? [];
      existing.push(override.channel);
      this.overrideMap.set(override.eventType, existing);
    }

    this.metricsService.setOverrideCacheSize(this.overrideMap.size);
  }

  async invalidate(eventType: string): Promise<void> {
    const overrides = await this.repository.findActiveByEventType(eventType);
    if (overrides.length === 0) {
      this.overrideMap.delete(eventType);
    } else {
      this.overrideMap.set(
        eventType,
        overrides.map((o) => o.channel),
      );
    }
    this.metricsService.setOverrideCacheSize(this.overrideMap.size);
  }

  get size(): number {
    return this.overrideMap.size;
  }
}
