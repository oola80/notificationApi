import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from 'prom-client';
import { DataSource } from 'typeorm';

@Injectable()
export class MetricsService implements OnModuleInit {
  readonly registry = new Registry();

  readonly templateRenderDuration: Histogram;
  readonly templateRenderTotal: Counter;
  readonly templateCacheHitsTotal: Counter;
  readonly templateCacheMissesTotal: Counter;
  readonly templateCacheSize: Gauge;
  readonly templateCrudTotal: Counter;
  readonly templateVersionCreatedTotal: Counter;
  readonly templateAuditPublishFailuresTotal: Counter;
  readonly templateCacheEvictionsTotal: Counter;
  readonly templateDbPoolActive: Gauge;

  constructor(@Optional() private readonly dataSource?: DataSource) {
    this.templateRenderDuration = new Histogram({
      name: 'ts_template_render_duration_seconds',
      help: 'Template render duration in seconds',
      labelNames: ['channel'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });

    this.templateRenderTotal = new Counter({
      name: 'ts_template_render_total',
      help: 'Total template render attempts',
      labelNames: ['channel', 'status'],
      registers: [this.registry],
    });

    this.templateCacheHitsTotal = new Counter({
      name: 'ts_template_cache_hits_total',
      help: 'Total template cache hits',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.templateCacheMissesTotal = new Counter({
      name: 'ts_template_cache_misses_total',
      help: 'Total template cache misses',
      labelNames: ['channel'],
      registers: [this.registry],
    });

    this.templateCacheSize = new Gauge({
      name: 'ts_template_cache_size',
      help: 'Number of entries in template cache',
      registers: [this.registry],
    });

    this.templateCrudTotal = new Counter({
      name: 'ts_template_crud_total',
      help: 'Total template CRUD operations',
      labelNames: ['operation'],
      registers: [this.registry],
    });

    this.templateVersionCreatedTotal = new Counter({
      name: 'ts_template_version_created_total',
      help: 'Total template versions created',
      registers: [this.registry],
    });

    this.templateAuditPublishFailuresTotal = new Counter({
      name: 'ts_template_audit_publish_failures_total',
      help: 'Total audit publish failures',
      registers: [this.registry],
    });

    this.templateCacheEvictionsTotal = new Counter({
      name: 'ts_template_cache_evictions_total',
      help: 'Total template cache evictions',
      registers: [this.registry],
    });

    this.templateDbPoolActive = new Gauge({
      name: 'ts_template_db_pool_active',
      help: 'Number of active database pool connections',
      registers: [this.registry],
      collect: () => {
        if (this.dataSource?.driver) {
          const pool = (this.dataSource.driver as any).master;
          if (pool) {
            this.templateDbPoolActive.set(
              (pool.totalCount ?? 0) - (pool.idleCount ?? 0),
            );
          }
        }
      },
    });
  }

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
  }

  incrementRenderTotal(channel: string, status: string): void {
    this.templateRenderTotal.inc({ channel, status });
  }

  observeRenderDuration(channel: string, seconds: number): void {
    this.templateRenderDuration.observe({ channel }, seconds);
  }

  incrementCacheHit(channel: string): void {
    this.templateCacheHitsTotal.inc({ channel });
  }

  incrementCacheMiss(channel: string): void {
    this.templateCacheMissesTotal.inc({ channel });
  }

  setCacheSize(n: number): void {
    this.templateCacheSize.set(n);
  }

  incrementCrudTotal(operation: string): void {
    this.templateCrudTotal.inc({ operation });
  }

  incrementVersionCreated(): void {
    this.templateVersionCreatedTotal.inc();
  }

  incrementAuditPublishFailure(): void {
    this.templateAuditPublishFailuresTotal.inc();
  }

  incrementCacheEviction(): void {
    this.templateCacheEvictionsTotal.inc();
  }
}
