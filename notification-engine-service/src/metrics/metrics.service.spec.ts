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

  it('should have a registry with all custom metrics registered', async () => {
    const metricsOutput = await service.registry.metrics();
    expect(metricsOutput).toContain('nes_events_consumed_total');
    expect(metricsOutput).toContain('nes_rules_matched_total');
    expect(metricsOutput).toContain('nes_notifications_created_total');
    expect(metricsOutput).toContain('nes_notifications_suppressed_total');
    expect(metricsOutput).toContain('nes_notifications_dispatched_total');
    expect(metricsOutput).toContain('nes_notifications_failed_total');
    expect(metricsOutput).toContain('nes_template_render_total');
    expect(metricsOutput).toContain('nes_event_processing_duration_seconds');
    expect(metricsOutput).toContain('nes_template_render_duration_seconds');
    expect(metricsOutput).toContain('nes_rule_evaluation_duration_seconds');
    expect(metricsOutput).toContain('nes_rule_cache_size');
    expect(metricsOutput).toContain('nes_preference_cache_size');
    expect(metricsOutput).toContain('nes_override_cache_size');
    expect(metricsOutput).toContain('nes_template_service_circuit_state');
  });

  it('should increment eventsConsumedTotal with labels', async () => {
    service.incrementEventsConsumed('critical', 'order.created');
    service.incrementEventsConsumed('critical', 'order.created');
    service.incrementEventsConsumed('normal', 'order.shipped');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'nes_events_consumed_total{priority="critical",eventType="order.created"} 2',
    );
    expect(metrics).toContain(
      'nes_events_consumed_total{priority="normal",eventType="order.shipped"} 1',
    );
  });

  it('should increment rulesMatchedTotal with labels', async () => {
    service.incrementRulesMatched('order.created', 'rule-1');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'nes_rules_matched_total{eventType="order.created",ruleId="rule-1"} 1',
    );
  });

  it('should increment notificationsCreatedTotal with labels', async () => {
    service.incrementNotificationsCreated('email', 'normal');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'nes_notifications_created_total{channel="email",priority="normal"} 1',
    );
  });

  it('should increment suppressedTotal with labels', async () => {
    service.incrementSuppressed('dedup', 'rule-1');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'nes_notifications_suppressed_total{mode="dedup",ruleId="rule-1"} 1',
    );
  });

  it('should increment dispatchedTotal with labels', async () => {
    service.incrementDispatched('sms', 'critical');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'nes_notifications_dispatched_total{channel="sms",priority="critical"} 1',
    );
  });

  it('should increment failedTotal with labels', async () => {
    service.incrementFailed('email', 'template_render');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'nes_notifications_failed_total{channel="email",reason="template_render"} 1',
    );
  });

  it('should increment templateRenderTotal with labels', async () => {
    service.incrementTemplateRender('email', 'success');
    service.incrementTemplateRender('email', 'failure');

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'nes_template_render_total{channel="email",status="success"} 1',
    );
    expect(metrics).toContain(
      'nes_template_render_total{channel="email",status="failure"} 1',
    );
  });

  it('should observe event processing duration in histogram', async () => {
    service.observeEventProcessing('normal', 0.042);
    service.observeEventProcessing('normal', 0.15);

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'nes_event_processing_duration_seconds_bucket{le="0.05",priority="normal"} 1',
    );
    expect(metrics).toContain(
      'nes_event_processing_duration_seconds_bucket{le="0.25",priority="normal"} 2',
    );
    expect(metrics).toContain(
      'nes_event_processing_duration_seconds_count{priority="normal"} 2',
    );
  });

  it('should observe template render duration in histogram', async () => {
    service.observeTemplateRender('email', 0.08);

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'nes_template_render_duration_seconds_bucket{le="0.1",channel="email"} 1',
    );
    expect(metrics).toContain(
      'nes_template_render_duration_seconds_count{channel="email"} 1',
    );
  });

  it('should observe rule evaluation duration in histogram', async () => {
    service.observeRuleEvaluation(0.003);

    const metrics = await service.registry.metrics();
    expect(metrics).toContain(
      'nes_rule_evaluation_duration_seconds_bucket{le="0.005"} 1',
    );
    expect(metrics).toContain('nes_rule_evaluation_duration_seconds_count 1');
  });

  it('should set gauge values', async () => {
    service.setRuleCacheSize(47);
    service.setPreferenceCacheSize(1200);
    service.setOverrideCacheSize(5);

    const metrics = await service.registry.metrics();
    expect(metrics).toContain('nes_rule_cache_size 47');
    expect(metrics).toContain('nes_preference_cache_size 1200');
    expect(metrics).toContain('nes_override_cache_size 5');
  });

  it('should set template service circuit state gauge', async () => {
    service.setTemplateServiceCircuitState(1);

    const metrics = await service.registry.metrics();
    expect(metrics).toContain('nes_template_service_circuit_state 1');
  });

  it('should update template service circuit state gauge to different values', async () => {
    service.setTemplateServiceCircuitState(0);
    let metrics = await service.registry.metrics();
    expect(metrics).toContain('nes_template_service_circuit_state 0');

    service.setTemplateServiceCircuitState(2);
    metrics = await service.registry.metrics();
    expect(metrics).toContain('nes_template_service_circuit_state 2');
  });

  it('should register default metrics on module init', async () => {
    service.onModuleInit();

    const metrics = await service.registry.metrics();
    expect(metrics).toContain('process_cpu');
  });
});
