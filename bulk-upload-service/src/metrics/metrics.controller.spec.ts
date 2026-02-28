import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

describe('MetricsController', () => {
  let controller: MetricsController;
  let metricsService: MetricsService;

  beforeEach(() => {
    metricsService = new MetricsService();
    controller = new MetricsController(metricsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return metrics with correct content type', async () => {
    const mockResponse = {
      set: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    await controller.getMetrics(mockResponse as any);

    expect(mockResponse.set).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4',
    );
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.send).toHaveBeenCalledWith(expect.any(String));
  });
});
