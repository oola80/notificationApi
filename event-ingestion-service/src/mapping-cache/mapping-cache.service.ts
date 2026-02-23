import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventMappingsRepository } from '../event-mappings/event-mappings.repository.js';
import { EventMapping } from '../event-mappings/entities/event-mapping.entity.js';
import { createErrorResponse } from '../common/errors.js';

@Injectable()
export class MappingCacheService implements OnModuleInit {
  private readonly logger = new Logger(MappingCacheService.name);
  private readonly cache = new Map<string, EventMapping>();
  private readonly inFlightQueries = new Map<
    string,
    Promise<EventMapping | null>
  >();
  private ready = false;
  readonly enabled: boolean;

  constructor(
    private readonly repository: EventMappingsRepository,
    private readonly configService: ConfigService,
  ) {
    this.enabled = this.configService.get<boolean>(
      'app.mappingCacheEnabled',
      false,
    );
  }

  async onModuleInit(): Promise<void> {
    if (this.enabled) {
      await this.warmUp();
      this.ready = true;
      this.logger.log(
        `Mapping cache warmed up with ${this.cache.size} entries`,
      );
    } else {
      this.ready = true;
      this.logger.log('Mapping cache disabled, using direct DB lookups');
    }
  }

  async warmUp(): Promise<void> {
    const mappings = await this.repository.findAllActive();
    this.cache.clear();
    for (const mapping of mappings) {
      const key = this.buildKey(mapping.sourceId, mapping.eventType);
      this.cache.set(key, mapping);
    }
  }

  async getMapping(
    sourceId: string,
    eventType: string,
  ): Promise<EventMapping | null> {
    if (!this.enabled) {
      return this.directDbLookup(sourceId, eventType);
    }

    if (!this.ready) {
      throw createErrorResponse('EIS-021');
    }

    // Try exact key
    const exactKey = this.buildKey(sourceId, eventType);
    const exactHit = this.cache.get(exactKey);
    if (exactHit) {
      return exactHit;
    }

    // Try wildcard key
    const wildcardKey = this.buildKey(sourceId, '*');
    const wildcardHit = this.cache.get(wildcardKey);
    if (wildcardHit) {
      return wildcardHit;
    }

    // Cache miss — single-flight fetch
    return this.singleFlightFetch(exactKey, sourceId, eventType);
  }

  async invalidateMapping(id: string, version: number): Promise<void> {
    this.logger.log(`Invalidating mapping ${id} (message version: ${version})`);

    let fetched: EventMapping | null;
    try {
      fetched = await this.repository.findById(id);
    } catch {
      this.logger.warn(`Failed to fetch mapping ${id} for cache invalidation`);
      return;
    }

    if (!fetched) {
      // Mapping deleted — remove from cache by scanning for this id
      for (const [key, entry] of this.cache.entries()) {
        if (entry.id === id) {
          this.cache.delete(key);
          this.logger.log(`Removed deleted mapping ${id} from cache`);
          break;
        }
      }
      return;
    }

    const key = this.buildKey(fetched.sourceId, fetched.eventType);
    const cached = this.cache.get(key);

    // Version check: discard stale invalidations
    if (cached && cached.version >= fetched.version) {
      return;
    }

    if (fetched.isActive) {
      this.cache.set(key, fetched);
      this.logger.log(`Updated cache for mapping ${id} (v${fetched.version})`);
    } else {
      this.cache.delete(key);
      this.logger.log(`Removed inactive mapping ${id} from cache`);
    }
  }

  getCacheStats(): { size: number; enabled: boolean; ready: boolean } {
    return {
      size: this.cache.size,
      enabled: this.enabled,
      ready: this.ready,
    };
  }

  private async singleFlightFetch(
    key: string,
    sourceId: string,
    eventType: string,
  ): Promise<EventMapping | null> {
    const existing = this.inFlightQueries.get(key);
    if (existing) {
      return existing;
    }

    const promise = this.fetchAndCache(key, sourceId, eventType);
    this.inFlightQueries.set(key, promise);

    try {
      return await promise;
    } finally {
      this.inFlightQueries.delete(key);
    }
  }

  private async fetchAndCache(
    key: string,
    sourceId: string,
    eventType: string,
  ): Promise<EventMapping | null> {
    // Exact match first
    let mapping = await this.repository.findBySourceAndType(
      sourceId,
      eventType,
    );
    if (!mapping) {
      // Wildcard fallback
      mapping = await this.repository.findBySourceAndType(sourceId, '*');
    }

    if (mapping) {
      this.cache.set(key, mapping);
    }

    return mapping;
  }

  private async directDbLookup(
    sourceId: string,
    eventType: string,
  ): Promise<EventMapping | null> {
    let mapping = await this.repository.findBySourceAndType(
      sourceId,
      eventType,
    );
    if (!mapping) {
      mapping = await this.repository.findBySourceAndType(sourceId, '*');
    }
    return mapping;
  }

  private buildKey(sourceId: string, eventType: string): string {
    return `${sourceId}:${eventType}`;
  }
}
