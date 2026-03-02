import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Handlebars from 'handlebars';
import { MetricsService } from '../../metrics/metrics.service.js';

export interface CompiledTemplate {
  subjectFn: Handlebars.TemplateDelegate | null;
  bodyFn: Handlebars.TemplateDelegate;
  channelMetadata: Record<string, any>;
}

@Injectable()
export class TemplateCacheService {
  private readonly cache = new Map<string, CompiledTemplate>();
  private readonly insertionOrder: string[] = [];
  private readonly maxSize: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.maxSize = this.configService.get<number>('app.cacheMaxSize', 1000);
  }

  get(key: string): CompiledTemplate | undefined {
    const entry = this.cache.get(key);
    const channel = this.extractChannel(key);

    if (entry) {
      this.metricsService.incrementCacheHit(channel);
    } else {
      this.metricsService.incrementCacheMiss(channel);
    }

    return entry;
  }

  set(key: string, compiled: CompiledTemplate): void {
    if (!this.cache.has(key)) {
      if (this.insertionOrder.length >= this.maxSize) {
        const oldest = this.insertionOrder.shift()!;
        this.cache.delete(oldest);
        this.metricsService.incrementCacheEviction();
      }
      this.insertionOrder.push(key);
    }

    this.cache.set(key, compiled);
    this.metricsService.setCacheSize(this.cache.size);
  }

  invalidate(templateId: string): void {
    const prefix = `${templateId}:`;
    const keysToRemove: string[] = [];

    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      this.cache.delete(key);
      const idx = this.insertionOrder.indexOf(key);
      if (idx !== -1) {
        this.insertionOrder.splice(idx, 1);
      }
    }

    this.metricsService.setCacheSize(this.cache.size);
  }

  invalidateAll(): void {
    this.cache.clear();
    this.insertionOrder.length = 0;
    this.metricsService.setCacheSize(0);
  }

  getStats(): { size: number; maxSize: number } {
    return { size: this.cache.size, maxSize: this.maxSize };
  }

  private extractChannel(key: string): string {
    const parts = key.split(':');
    return parts[2] ?? 'unknown';
  }
}
