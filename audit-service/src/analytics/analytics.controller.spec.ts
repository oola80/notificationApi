import { HttpException } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let mockService: any;
  let mockAggregationService: any;

  beforeEach(() => {
    mockService = {
      query: jest.fn().mockResolvedValue({ data: [], meta: {} }),
      summary: jest.fn().mockResolvedValue({ today: {}, last7Days: {}, channelBreakdown: [] }),
    };
    mockAggregationService = {
      runManualAggregation: jest.fn().mockResolvedValue({ hourly: true, daily: true }),
    };
    controller = new AnalyticsController(mockService, mockAggregationService);
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

  it('should delegate aggregate to aggregation service', async () => {
    const result = await controller.aggregate({});
    expect(mockAggregationService.runManualAggregation).toHaveBeenCalledWith(undefined);
    expect(result).toEqual({ hourly: true, daily: true });
  });

  it('should pass period to aggregation service', async () => {
    await controller.aggregate({ period: 'hourly' });
    expect(mockAggregationService.runManualAggregation).toHaveBeenCalledWith('hourly');
  });

  it('should throw AUD-010 on aggregation failure', async () => {
    mockAggregationService.runManualAggregation.mockRejectedValue(new Error('DB error'));
    await expect(controller.aggregate({})).rejects.toThrow(HttpException);
  });
});
