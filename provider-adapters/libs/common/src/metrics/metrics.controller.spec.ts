import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

describe('MetricsController', () => {
  let controller: MetricsController;
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
    controller = new MetricsController(metricsService);
  });

  it('should return Prometheus metrics', async () => {
    const mockSend = jest.fn();
    const mockSet = jest.fn().mockReturnValue({ status: jest.fn().mockReturnValue({ send: mockSend }) });
    const mockResponse = { set: mockSet } as any;

    await controller.getMetrics(mockResponse);

    expect(mockSet).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4',
    );
    expect(mockSend).toHaveBeenCalled();
  });
});
