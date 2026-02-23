import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [MetricsService],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should have a registry with all metrics registered', async () => {
    const metricsOutput = await service.registry.metrics();
    expect(metricsOutput).toContain('event_ingestion_received_total');
    expect(metricsOutput).toContain('event_ingestion_published_total');
    expect(metricsOutput).toContain('event_ingestion_failed_total');
    expect(metricsOutput).toContain('event_ingestion_duplicate_total');
    expect(metricsOutput).toContain('event_ingestion_validation_errors_total');
    expect(metricsOutput).toContain('event_ingestion_mapping_not_found_total');
    expect(metricsOutput).toContain(
      'event_ingestion_mapping_cache_invalidations_total',
    );
    expect(metricsOutput).toContain(
      'event_ingestion_processing_duration_ms_bucket',
    );
    expect(metricsOutput).toContain('event_ingestion_queue_depth');
    expect(metricsOutput).toContain('event_ingestion_consumer_lag');
    expect(metricsOutput).toContain('event_ingestion_dlq_depth');
    expect(metricsOutput).toContain('event_ingestion_service_pool_active');
    expect(metricsOutput).toContain('event_ingestion_mapping_cache_hit_rate');
  });

  it('should increment receivedTotal counter with sourceId label', async () => {
    service.incrementReceived('shopify');
    service.incrementReceived('shopify');
    service.incrementReceived('magento');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'event_ingestion_received_total{sourceId="shopify"} 2',
    );
    expect(metrics).toContain(
      'event_ingestion_received_total{sourceId="magento"} 1',
    );
  });

  it('should increment publishedTotal counter', async () => {
    service.incrementPublished();

    const metrics = await service.registry.metrics();
    expect(metrics).toContain('event_ingestion_published_total 1');
  });

  it('should increment failedTotal counter', async () => {
    service.incrementFailed();
    service.incrementFailed();

    const metrics = await service.registry.metrics();
    expect(metrics).toContain('event_ingestion_failed_total 2');
  });

  it('should increment duplicateTotal counter', async () => {
    service.incrementDuplicate();

    const metrics = await service.registry.metrics();
    expect(metrics).toContain('event_ingestion_duplicate_total 1');
  });

  it('should increment validationErrorsTotal with sourceId label', async () => {
    service.incrementValidationError('shopify');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'event_ingestion_validation_errors_total{sourceId="shopify"} 1',
    );
  });

  it('should increment mappingNotFoundTotal counter', async () => {
    service.incrementMappingNotFound();

    const metrics = await service.registry.metrics();
    expect(metrics).toContain('event_ingestion_mapping_not_found_total 1');
  });

  it('should increment cacheInvalidation counter', async () => {
    service.incrementCacheInvalidation();

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'event_ingestion_mapping_cache_invalidations_total 1',
    );
  });

  it('should observe processing duration in histogram', async () => {
    service.observeProcessingDuration(42);
    service.observeProcessingDuration(150);

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'event_ingestion_processing_duration_ms_bucket{le="50"} 1',
    );
    expect(metrics).toContain(
      'event_ingestion_processing_duration_ms_bucket{le="250"} 2',
    );
    expect(metrics).toContain('event_ingestion_processing_duration_ms_count 2');
  });

  it('should register default metrics on module init', async () => {
    service.onModuleInit();

    const metrics = await service.registry.metrics();
    expect(metrics).toContain('process_cpu');
  });
});
