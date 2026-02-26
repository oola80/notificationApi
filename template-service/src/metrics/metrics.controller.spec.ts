import { MetricsController } from './metrics.controller.js';

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockMetricsService: any;
  let mockResponse: any;

  beforeEach(() => {
    mockMetricsService = {
      registry: {
        metrics: jest
          .fn()
          .mockResolvedValue(
            '# HELP ts_template_render_total Total template render attempts\n',
          ),
      },
    };
    mockResponse = {
      set: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    controller = new MetricsController(mockMetricsService);
  });

  it('should return Prometheus text format with correct content-type', async () => {
    await controller.getMetrics(mockResponse);

    expect(mockResponse.set).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain; version=0.0.4',
    );
    expect(mockResponse.send).toHaveBeenCalledWith(
      expect.stringContaining('ts_template_render_total'),
    );
  });

  it('should return 200 status', async () => {
    await controller.getMetrics(mockResponse);

    expect(mockResponse.status).toHaveBeenCalledWith(200);
  });
});
