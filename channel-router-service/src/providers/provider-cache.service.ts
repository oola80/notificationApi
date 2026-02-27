import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderConfig } from './entities/provider-config.entity.js';
import { ProviderConfigsRepository } from './provider-configs.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';

@Injectable()
export class ProviderCacheService implements OnModuleInit {
  private readonly logger = new Logger(ProviderCacheService.name);
  private readonly enabled: boolean;
  private readonly ttlMs: number;
  private cache = new Map<string, ProviderConfig[]>();
  private lastRefreshedAt = 0;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly providerConfigsRepository: ProviderConfigsRepository,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.enabled = this.configService.get<boolean>(
      'app.providerCacheEnabled',
      true,
    );
    this.ttlMs =
      this.configService.get<number>('app.providerCacheTtlSeconds', 300) * 1000;
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Provider cache disabled');
      return;
    }

    await this.loadCache();
    this.refreshTimer = setInterval(() => this.loadCache(), this.ttlMs);
    this.logger.log(`Provider cache initialized, TTL=${this.ttlMs / 1000}s`);
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  getActiveProvidersByChannel(channel: string): ProviderConfig[] {
    if (!this.enabled) {
      return [];
    }

    const providers = this.cache.get(channel);
    if (providers) {
      return providers;
    }

    return [];
  }

  async invalidate(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    this.logger.log('Provider cache invalidated, reloading');
    await this.loadCache();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getLastRefreshedAt(): number {
    return this.lastRefreshedAt;
  }

  getCacheSize(): number {
    let total = 0;
    for (const providers of this.cache.values()) {
      total += providers.length;
    }
    return total;
  }

  private async loadCache(): Promise<void> {
    try {
      const channels = ['email', 'sms', 'whatsapp', 'push'];
      const newCache = new Map<string, ProviderConfig[]>();

      for (const channel of channels) {
        const providers =
          await this.providerConfigsRepository.findActiveByChannel(channel);
        if (providers.length > 0) {
          newCache.set(channel, providers);
        }
      }

      this.cache = newCache;
      this.lastRefreshedAt = Date.now();

      const totalProviders = this.getCacheSize();
      this.logger.log(
        `Provider cache loaded: ${totalProviders} active providers across ${newCache.size} channels`,
      );
    } catch (error: any) {
      this.logger.error(`Failed to load provider cache: ${error.message}`);
    }
  }
}
