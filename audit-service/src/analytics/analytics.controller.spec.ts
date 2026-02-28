import { AnalyticsController } from './analytics.controller';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      query: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      summary: jest.fn().mockResolvedValue({ today: {}, last7Days: {}, channelBreakdown: [] }),
    };
    controller = new AnalyticsController(mockService);
  });

  it('should delegate query to service', async () => {
    const dto = { period: 'daily', from: '2026-02-01', to: '2026-02-28' };
    await controller.query(dto as any);
    expect(mockService.query).toHaveBeenCalledWith(dto);
  });

  it('should delegate summary to service', async () => {
    await controller.summary();
    expect(mockService.summary).toHaveBeenCalled();
  });
});
