import { MetricsService } from './metrics.service.js';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('should initialize with a registry', () => {
    expect(service.registry).toBeDefined();
  });

  it('should have all expected metrics', () => {
    expect(service.sendTotal).toBeDefined();
    expect(service.sendDurationSeconds).toBeDefined();
    expect(service.sendErrorsTotal).toBeDefined();
    expect(service.webhookReceivedTotal).toBeDefined();
    expect(service.webhookVerificationFailuresTotal).toBeDefined();
    expect(service.rabbitmqPublishTotal).toBeDefined();
    expect(service.healthStatus).toBeDefined();
  });

  it('should increment send total', async () => {
    service.incrementSend('mailgun', 'email', 'success');
    const metrics = await service.registry.metrics();
    expect(metrics).toContain('adapter_send_total');
  });

  it('should observe send duration', async () => {
    service.observeSendDuration('mailgun', 'email', 0.5);
    const metrics = await service.registry.metrics();
    expect(metrics).toContain('adapter_send_duration_seconds');
  });

  it('should increment send errors', async () => {
    service.incrementSendErrors('mailgun', 'email', 'timeout');
    const metrics = await service.registry.metrics();
    expect(metrics).toContain('adapter_send_errors_total');
  });

  it('should increment webhook received', async () => {
    service.incrementWebhookReceived('mailgun', 'delivered');
    const metrics = await service.registry.metrics();
    expect(metrics).toContain('adapter_webhook_received_total');
  });

  it('should increment webhook verification failures', async () => {
    service.incrementWebhookVerificationFailures('mailgun');
    const metrics = await service.registry.metrics();
    expect(metrics).toContain('adapter_webhook_verification_failures_total');
  });

  it('should increment rabbitmq publish', async () => {
    service.incrementRabbitmqPublish('mailgun', 'success');
    const metrics = await service.registry.metrics();
    expect(metrics).toContain('adapter_rabbitmq_publish_total');
  });

  it('should set health status', async () => {
    service.setHealthStatus('mailgun', 1);
    const metrics = await service.registry.metrics();
    expect(metrics).toContain('adapter_health_status');
  });

  it('should register default metrics on init', () => {
    service.onModuleInit();
    expect(service.registry.getMetricsAsArray().length).toBeGreaterThan(7);
  });
});
