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

  it('should have all 13 custom metrics registered', async () => {
    const output = await service.registry.metrics();

    // 7 Counters
    expect(output).toContain('channel_router_delivery_total');
    expect(output).toContain('channel_router_adapter_unavailable_total');
    expect(output).toContain('channel_router_retry_total');
    expect(output).toContain('channel_router_circuit_breaker_trips_total');
    expect(output).toContain('channel_router_fallback_triggered_total');
    expect(output).toContain('channel_router_media_failure_total');
    expect(output).toContain('channel_router_dlq_total');

    // 4 Histograms
    expect(output).toContain('channel_router_delivery_duration_ms');
    expect(output).toContain('channel_router_adapter_call_duration_ms');
    expect(output).toContain('channel_router_rate_limit_wait_ms');
    expect(output).toContain('channel_router_media_download_duration_ms');

    // 2 Gauges
    expect(output).toContain('channel_router_circuit_breaker_state');
    expect(output).toContain('channel_router_queue_depth');
  });

  it('should increment delivery counter with labels', async () => {
    service.incrementDelivery('email', 'sendgrid', 'SENT');
    service.incrementDelivery('email', 'sendgrid', 'SENT');
    service.incrementDelivery('email', 'sendgrid', 'FAILED');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_delivery_total{channel="email",adapter="sendgrid",status="SENT"} 2',
    );
    expect(metrics).toContain(
      'channel_router_delivery_total{channel="email",adapter="sendgrid",status="FAILED"} 1',
    );
  });

  it('should increment adapter unavailable counter', async () => {
    service.incrementAdapterUnavailable('sendgrid');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_adapter_unavailable_total{adapter="sendgrid"} 1',
    );
  });

  it('should increment retry counter with labels', async () => {
    service.incrementRetry('email', 'sendgrid', '2');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_retry_total{channel="email",adapter="sendgrid",attempt_number="2"} 1',
    );
  });

  it('should increment circuit breaker trips counter', async () => {
    service.incrementCircuitBreakerTrips('mailgun');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_circuit_breaker_trips_total{adapter="mailgun"} 1',
    );
  });

  it('should increment fallback triggered counter', async () => {
    service.incrementFallbackTriggered('email', 'sms');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_fallback_triggered_total{primary_channel="email",fallback_channel="sms"} 1',
    );
  });

  it('should increment media failure counter', async () => {
    service.incrementMediaFailure('whatsapp', 'timeout');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_media_failure_total{channel="whatsapp",reason="timeout"} 1',
    );
  });

  it('should increment DLQ counter', async () => {
    service.incrementDlq('sms', 'twilio');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_dlq_total{channel="sms",adapter="twilio"} 1',
    );
  });

  it('should observe delivery duration histogram', async () => {
    service.observeDeliveryDuration('email', 'sendgrid', 150);
    service.observeDeliveryDuration('email', 'sendgrid', 3500);

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_delivery_duration_ms_bucket{le="250",channel="email",adapter="sendgrid"} 1',
    );
    expect(metrics).toContain(
      'channel_router_delivery_duration_ms_bucket{le="5000",channel="email",adapter="sendgrid"} 2',
    );
    expect(metrics).toContain(
      'channel_router_delivery_duration_ms_count{channel="email",adapter="sendgrid"} 2',
    );
  });

  it('should observe adapter call duration histogram', async () => {
    service.observeAdapterCallDuration('sendgrid', 200);

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_adapter_call_duration_ms_bucket{le="250",adapter="sendgrid"} 1',
    );
  });

  it('should observe rate limit wait histogram', async () => {
    service.observeRateLimitWait('braze', 75);

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_rate_limit_wait_ms_bucket{le="100",adapter="braze"} 1',
    );
  });

  it('should observe media download duration histogram', async () => {
    service.observeMediaDownloadDuration('whatsapp', 800);

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_media_download_duration_ms_bucket{le="1000",channel="whatsapp"} 1',
    );
  });

  it('should set circuit breaker state gauge', async () => {
    service.setCircuitBreakerState('sendgrid', 0);
    let metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_circuit_breaker_state{adapter="sendgrid"} 0',
    );

    service.setCircuitBreakerState('sendgrid', 2);
    metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_circuit_breaker_state{adapter="sendgrid"} 2',
    );
  });

  it('should set queue depth gauge', async () => {
    service.setQueueDepth('q.deliver.email.critical', 42);

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'channel_router_queue_depth{queue="q.deliver.email.critical"} 42',
    );
  });

  it('should register default metrics on module init', async () => {
    service.onModuleInit();

    const metrics = await service.registry.metrics();
    expect(metrics).toContain('process_cpu');
  });
});
