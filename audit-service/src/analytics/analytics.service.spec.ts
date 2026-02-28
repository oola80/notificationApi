import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let mockRepo: any;

  beforeEach(() => {
    mockRepo = {
      findWithFilters: jest.fn(),
      findForSummary: jest.fn(),
    };
    service = new AnalyticsService(mockRepo);
  });

  describe('query', () => {
    it('should return paginated analytics data with meta', async () => {
      mockRepo.findWithFilters.mockResolvedValue({
        data: [
          { id: 'a-1', period: 'daily', channel: 'email', totalSent: 100 },
        ],
        total: 1,
        page: 1,
        limit: 50,
      });

      const result = await service.query({
        period: 'daily',
        from: '2026-02-01',
        to: '2026-02-28',
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.period).toBe('daily');
      expect(result.meta.totalRecords).toBe(1);
    });

    it('should pass all filters to repository', async () => {
      mockRepo.findWithFilters.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 25,
      });

      await service.query({
        period: 'hourly',
        from: '2026-02-28T00:00:00Z',
        to: '2026-02-28T23:59:59Z',
        channel: 'email',
        eventType: 'order.delay',
        page: 2,
        pageSize: 25,
      });

      expect(mockRepo.findWithFilters).toHaveBeenCalledWith({
        period: 'hourly',
        from: '2026-02-28T00:00:00Z',
        to: '2026-02-28T23:59:59Z',
        channel: 'email',
        eventType: 'order.delay',
        page: 2,
        limit: 25,
      });
    });

    it('should default period to daily', async () => {
      mockRepo.findWithFilters.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 50,
      });

      const result = await service.query({
        from: '2026-02-01',
        to: '2026-02-28',
      });

      expect(result.meta.period).toBe('daily');
      expect(mockRepo.findWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({ period: 'daily' }),
      );
    });
  });

  describe('summary', () => {
    it('should compute today summary from hourly data', async () => {
      mockRepo.findForSummary.mockImplementation(
        (period: string) => {
          if (period === 'hourly') {
            return [
              {
                channel: '_all',
                totalSent: 50,
                totalDelivered: 45,
                totalFailed: 3,
                avgLatencyMs: null,
              },
              {
                channel: '_all',
                totalSent: 30,
                totalDelivered: 28,
                totalFailed: 1,
                avgLatencyMs: null,
              },
              {
                channel: 'email',
                totalSent: 40,
                totalDelivered: 38,
                totalFailed: 2,
                avgLatencyMs: null,
              },
            ];
          }
          return [];
        },
      );

      const result = await service.summary();

      expect(result.today.totalSent).toBe(80);
      expect(result.today.totalDelivered).toBe(73);
      expect(result.today.totalFailed).toBe(4);
      expect(result.today.deliveryRate).toBe(91.25);
      expect(result.today.failureRate).toBe(5);
    });

    it('should compute last 7 days summary from daily data', async () => {
      mockRepo.findForSummary.mockImplementation(
        (period: string) => {
          if (period === 'daily') {
            return [
              {
                channel: '_all',
                totalSent: 500,
                totalDelivered: 450,
                totalFailed: 30,
                avgLatencyMs: 150.5,
              },
            ];
          }
          return [];
        },
      );

      const result = await service.summary();

      expect(result.last7Days.totalSent).toBe(500);
      expect(result.last7Days.totalDelivered).toBe(450);
      expect(result.last7Days.deliveryRate).toBe(90);
      expect(result.last7Days.avgLatencyMs).toBe(150.5);
    });

    it('should compute channel breakdown from today hourly data', async () => {
      mockRepo.findForSummary.mockImplementation(
        (period: string) => {
          if (period === 'hourly') {
            return [
              {
                channel: 'email',
                totalSent: 100,
                totalDelivered: 95,
                totalFailed: 3,
                avgLatencyMs: null,
              },
              {
                channel: 'sms',
                totalSent: 50,
                totalDelivered: 48,
                totalFailed: 1,
                avgLatencyMs: null,
              },
              {
                channel: '_all',
                totalSent: 150,
                totalDelivered: 143,
                totalFailed: 4,
                avgLatencyMs: null,
              },
            ];
          }
          return [];
        },
      );

      const result = await service.summary();

      expect(result.channelBreakdown).toHaveLength(2);
      const email = result.channelBreakdown.find(
        (c: any) => c.channel === 'email',
      );
      expect(email?.totalSent).toBe(100);
      expect(email?.deliveryRate).toBe(95);
    });

    it('should handle zero totals without division errors', async () => {
      mockRepo.findForSummary.mockResolvedValue([]);

      const result = await service.summary();

      expect(result.today.deliveryRate).toBe(0);
      expect(result.today.failureRate).toBe(0);
      expect(result.last7Days.deliveryRate).toBe(0);
      expect(result.channelBreakdown).toHaveLength(0);
    });

    it('should aggregate latency from daily rows', async () => {
      mockRepo.findForSummary.mockImplementation(
        (period: string) => {
          if (period === 'daily') {
            return [
              {
                channel: '_all',
                totalSent: 100,
                totalDelivered: 90,
                totalFailed: 5,
                avgLatencyMs: 200,
              },
              {
                channel: '_all',
                totalSent: 100,
                totalDelivered: 85,
                totalFailed: 10,
                avgLatencyMs: 300,
              },
            ];
          }
          return [];
        },
      );

      const result = await service.summary();
      expect(result.last7Days.avgLatencyMs).toBe(250);
    });
  });
});
