import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerPreferencesRepository } from './customer-preferences.repository.js';
import { CustomerChannelPreference } from './entities/customer-channel-preference.entity.js';
import { MetricsService } from '../metrics/metrics.service.js';

interface CacheEntry {
  preferences: CustomerChannelPreference[];
  expiresAt: number;
}

@Injectable()
export class PreferenceCacheService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly insertionOrder: string[] = [];
  private readonly enabled: boolean;
  private readonly ttlMs: number;
  private readonly maxSize: number;

  constructor(
    private readonly config: ConfigService,
    private readonly repository: CustomerPreferencesRepository,
    private readonly metricsService: MetricsService,
  ) {
    this.enabled = this.config.get<boolean>('app.prefCacheEnabled', true);
    this.ttlMs = this.config.get<number>('app.prefCacheTtlSeconds', 300) * 1000;
    this.maxSize = this.config.get<number>('app.prefCacheMaxSize', 50000);
  }

  async getPreferences(
    customerId: string,
  ): Promise<CustomerChannelPreference[]> {
    if (!this.enabled) {
      return this.repository.findByCustomerId(customerId);
    }

    const cached = this.cache.get(customerId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.preferences;
    }

    const preferences = await this.repository.findByCustomerId(customerId);
    this.set(customerId, preferences);
    return preferences;
  }

  evict(customerId: string): void {
    this.cache.delete(customerId);
    const idx = this.insertionOrder.indexOf(customerId);
    if (idx !== -1) {
      this.insertionOrder.splice(idx, 1);
    }
    this.metricsService.setPreferenceCacheSize(this.cache.size);
  }

  clear(): void {
    this.cache.clear();
    this.insertionOrder.length = 0;
    this.metricsService.setPreferenceCacheSize(0);
  }

  get size(): number {
    return this.cache.size;
  }

  private set(
    customerId: string,
    preferences: CustomerChannelPreference[],
  ): void {
    if (this.cache.has(customerId)) {
      this.cache.set(customerId, {
        preferences,
        expiresAt: Date.now() + this.ttlMs,
      });
      this.metricsService.setPreferenceCacheSize(this.cache.size);
      return;
    }

    while (this.cache.size >= this.maxSize && this.insertionOrder.length > 0) {
      const oldest = this.insertionOrder.shift()!;
      this.cache.delete(oldest);
    }

    this.cache.set(customerId, {
      preferences,
      expiresAt: Date.now() + this.ttlMs,
    });
    this.insertionOrder.push(customerId);
    this.metricsService.setPreferenceCacheSize(this.cache.size);
  }
}
