import { Test, TestingModule } from '@nestjs/testing';
import { Nack } from '@golevelup/nestjs-rabbitmq';
import { WhatsappCriticalConsumer } from './whatsapp-critical.consumer.js';
import { DeliveryPipelineService } from '../delivery/delivery-pipeline.service.js';
import { MetricsService } from '../metrics/metrics.service.js';

describe('WhatsappCriticalConsumer', () => {
  let consumer: WhatsappCriticalConsumer;
  let pipelineService: jest.Mocked<DeliveryPipelineService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappCriticalConsumer,
        {
          provide: DeliveryPipelineService,
          useValue: { execute: jest.fn().mockResolvedValue({ success: true }) },
        },
        { provide: MetricsService, useValue: {} },
      ],
    }).compile();

    consumer = module.get<WhatsappCriticalConsumer>(WhatsappCriticalConsumer);
    pipelineService = module.get(DeliveryPipelineService);
  });

  it('should be defined', () => {
    expect(consumer).toBeDefined();
  });

  it('should delegate to pipeline via handle method', async () => {
    const msg = {
      notificationId: 'n-1',
      channel: 'whatsapp',
      priority: 'critical',
      content: { body: 'test' },
    } as any;
    const result = await consumer.handle(msg, {});
    expect(pipelineService.execute).toHaveBeenCalledWith(msg);
    expect(result).toBeUndefined();
  });

  it('should return Nack on pipeline error', async () => {
    pipelineService.execute.mockRejectedValue(new Error('fail'));
    const msg = {
      notificationId: 'n-1',
      channel: 'whatsapp',
      content: { body: 'test' },
    } as any;
    const result = await consumer.handle(msg, {});
    expect(result).toBeInstanceOf(Nack);
  });
});
