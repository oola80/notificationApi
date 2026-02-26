import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('should register all custom metrics in registry', async () => {
    const metricsText = await service.registry.metrics();

    expect(metricsText).toContain('ts_template_render_duration_seconds');
    expect(metricsText).toContain('ts_template_render_total');
    expect(metricsText).toContain('ts_template_cache_hits_total');
    expect(metricsText).toContain('ts_template_cache_misses_total');
    expect(metricsText).toContain('ts_template_cache_size');
    expect(metricsText).toContain('ts_template_crud_total');
    expect(metricsText).toContain('ts_template_version_created_total');
    expect(metricsText).toContain('ts_template_audit_publish_failures_total');
    expect(metricsText).toContain('ts_template_cache_evictions_total');
    expect(metricsText).toContain('ts_template_db_pool_active');
  });

  it('should increment render total', async () => {
    service.incrementRenderTotal('email', 'success');
    service.incrementRenderTotal('email', 'success');

    const metricsText = await service.registry.metrics();
    expect(metricsText).toContain(
      'ts_template_render_total{channel="email",status="success"} 2',
    );
  });

  it('should observe render duration', async () => {
    service.observeRenderDuration('email', 0.05);

    const metricsText = await service.registry.metrics();
    expect(metricsText).toContain('ts_template_render_duration_seconds');
  });

  it('should increment cache hit', async () => {
    service.incrementCacheHit('sms');

    const metricsText = await service.registry.metrics();
    expect(metricsText).toContain(
      'ts_template_cache_hits_total{channel="sms"} 1',
    );
  });

  it('should increment cache miss', async () => {
    service.incrementCacheMiss('push');

    const metricsText = await service.registry.metrics();
    expect(metricsText).toContain(
      'ts_template_cache_misses_total{channel="push"} 1',
    );
  });

  it('should set cache size', async () => {
    service.setCacheSize(42);

    const metricsText = await service.registry.metrics();
    expect(metricsText).toContain('ts_template_cache_size 42');
  });

  it('should collect default metrics on module init', () => {
    service.onModuleInit();

    // After collectDefaultMetrics, registry should have process/nodejs metrics
    const metricNames = service.registry.getMetricsAsArray().map((m) => m.name);
    expect(metricNames.length).toBeGreaterThan(5);
  });

  it('should increment crud total', async () => {
    service.incrementCrudTotal('create');
    service.incrementCrudTotal('create');
    service.incrementCrudTotal('delete');

    const metricsText = await service.registry.metrics();
    expect(metricsText).toContain(
      'ts_template_crud_total{operation="create"} 2',
    );
    expect(metricsText).toContain(
      'ts_template_crud_total{operation="delete"} 1',
    );
  });

  it('should increment version created total', async () => {
    service.incrementVersionCreated();
    service.incrementVersionCreated();

    const metricsText = await service.registry.metrics();
    expect(metricsText).toContain('ts_template_version_created_total 2');
  });

  it('should increment audit publish failure total', async () => {
    service.incrementAuditPublishFailure();

    const metricsText = await service.registry.metrics();
    expect(metricsText).toContain(
      'ts_template_audit_publish_failures_total 1',
    );
  });

  it('should increment cache eviction total', async () => {
    service.incrementCacheEviction();
    service.incrementCacheEviction();
    service.incrementCacheEviction();

    const metricsText = await service.registry.metrics();
    expect(metricsText).toContain('ts_template_cache_evictions_total 3');
  });

  it('should handle db pool active gauge when no dataSource', async () => {
    // Service created without dataSource — collect callback should be a no-op
    const metricsText = await service.registry.metrics();
    expect(metricsText).toContain('ts_template_db_pool_active');
  });
});
