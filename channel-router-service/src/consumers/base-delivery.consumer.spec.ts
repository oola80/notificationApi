import { Nack } from '@golevelup/nestjs-rabbitmq';
import { Logger } from '@nestjs/common';
import { BaseDeliveryConsumer } from './base-delivery.consumer.js';
import { DeliveryPipelineService } from '../delivery/delivery-pipeline.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { DispatchMessage } from '../delivery/interfaces/dispatch-message.interface.js';

class TestConsumer extends BaseDeliveryConsumer {
  protected readonly logger = new Logger('TestConsumer');
  protected readonly channel = 'email';
  protected readonly priority = 'critical';
  protected readonly queueName = 'q.test';
}

describe('BaseDeliveryConsumer', () => {
  let consumer: TestConsumer;
  let pipelineService: jest.Mocked<DeliveryPipelineService>;
  let metricsService: jest.Mocked<MetricsService>;

  const mockDispatch: DispatchMessage = {
    notificationId: 'notif-1',
    eventId: 'evt-1',
    ruleId: 'rule-1',
    channel: 'email',
    priority: 'critical',
    recipient: { email: 'test@example.com' },
    content: { body: 'Hello' },
    metadata: {},
  };

  beforeEach(() => {
    pipelineService = {
      execute: jest.fn().mockResolvedValue({ success: true }),
    } as any;
    metricsService = {} as any;
    consumer = new TestConsumer(pipelineService, metricsService);
  });

  it('should delegate to pipeline service and return void (ACK)', async () => {
    const result = await consumer.handleMessage(mockDispatch, {});
    expect(pipelineService.execute).toHaveBeenCalledWith(mockDispatch);
    expect(result).toBeUndefined();
  });

  it('should return Nack(false) on unhandled error', async () => {
    pipelineService.execute.mockRejectedValue(new Error('Unhandled'));

    const result = await consumer.handleMessage(mockDispatch, {});
    expect(result).toBeInstanceOf(Nack);
    expect((result as Nack).requeue).toBe(false);
  });

  it('should return void even when pipeline returns failed result', async () => {
    pipelineService.execute.mockResolvedValue({
      success: false,
      notificationId: 'notif-1',
      channel: 'email',
      attemptNumber: 1,
      durationMs: 100,
    });

    const result = await consumer.handleMessage(mockDispatch, {});
    expect(result).toBeUndefined();
  });

  it('should call pipeline with exact dispatch message', async () => {
    const specificDispatch = {
      ...mockDispatch,
      attemptNumber: 3,
      isFallback: true,
    };
    await consumer.handleMessage(specificDispatch, {});
    expect(pipelineService.execute).toHaveBeenCalledWith(specificDispatch);
  });

  it('should handle pipeline throwing non-Error objects', async () => {
    pipelineService.execute.mockRejectedValue('string error');

    const result = await consumer.handleMessage(mockDispatch, {});
    expect(result).toBeInstanceOf(Nack);
  });
});
