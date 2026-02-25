import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

describe('MetricsController', () => {
  let controller: MetricsController;
  let metricsService: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [MetricsService],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    metricsService = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return metrics in Prometheus text format with correct content-type', async () => {
    metricsService.incrementEventsConsumed('normal', 'order.created');

    const mockSet = jest.fn().mockReturnThis();
    const mockStatus = jest.fn().mockReturnThis();
    const mockSend = jest.fn().mockReturnThis();
    const mockResponse = {
      set: mockSet,
      status: mockStatus,
      send: mockSend,
    } as any;

    await controller.getMetrics(mockResponse);

    expect(mockSet).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4',
    );
    expect(mockStatus).toHaveBeenCalledWith(200);
    expect(mockSend).toHaveBeenCalledWith(
      expect.stringContaining(
        'nes_events_consumed_total{priority="normal",eventType="order.created"} 1',
      ),
    );
  });

  it('should return 200 status', async () => {
    const mockSet = jest.fn().mockReturnThis();
    const mockStatus = jest.fn().mockReturnThis();
    const mockSend = jest.fn().mockReturnThis();
    const mockResponse = {
      set: mockSet,
      status: mockStatus,
      send: mockSend,
    } as any;

    await controller.getMetrics(mockResponse);

    expect(mockStatus).toHaveBeenCalledWith(200);
  });
});
