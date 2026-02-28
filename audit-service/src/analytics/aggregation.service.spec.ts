import { AggregationService } from './aggregation.service';

describe('AggregationService', () => {
  let service: AggregationService;
  let mockAnalyticsRepo: any;
  let mockMetrics: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockAnalyticsRepo = {
      aggregateFromReceipts: jest.fn().mockResolvedValue([]),
      countSuppressed: jest.fn().mockResolvedValue({}),
      upsertRow: jest.fn().mockResolvedValue(undefined),
    };
    mockMetrics = {
      observeAggregationDuration: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn().mockReturnValue('5 * * * *'),
    };
    service = new AggregationService(
      mockAnalyticsRepo,
      mockMetrics,
      mockConfigService,
    );
  });

  describe('aggregate', () => {
    const periodStart = new Date('2026-02-28T10:00:00Z');
    const periodEnd = new Date('2026-02-28T11:00:00Z');

    it('should aggregate receipt data and upsert per-channel rows', async () => {
      mockAnalyticsRepo.aggregateFromReceipts.mockResolvedValue([
        {
          channel: 'email',
          eventType: null,
          totalSent: 100,
          totalDelivered: 90,
          totalFailed: 5,
          totalOpened: 50,
          totalClicked: 20,
          totalBounced: 3,
          totalSuppressed: 0,
          avgLatencyMs: null,
        },
        {
          channel: 'sms',
          eventType: null,
          totalSent: 50,
          totalDelivered: 48,
          totalFailed: 2,
          totalOpened: 0,
          totalClicked: 0,
          totalBounced: 0,
          totalSuppressed: 0,
          avgLatencyMs: null,
        },
      ]);
      mockAnalyticsRepo.countSuppressed.mockResolvedValue({ email: 2 });

      await service.aggregate('hourly', periodStart, periodEnd);

      // 2 channel rows + 1 _all cross-total = 3 upserts
      expect(mockAnalyticsRepo.upsertRow).toHaveBeenCalledTimes(3);

      // Email row should have suppressed count merged
      expect(mockAnalyticsRepo.upsertRow).toHaveBeenCalledWith(
        'hourly',
        periodStart,
        expect.objectContaining({
          channel: 'email',
          totalSent: 100,
          totalDelivered: 90,
          totalSuppressed: 2,
        }),
      );

      // _all cross-total
      expect(mockAnalyticsRepo.upsertRow).toHaveBeenCalledWith(
        'hourly',
        periodStart,
        expect.objectContaining({
          channel: '_all',
          totalSent: 150,
          totalDelivered: 138,
          totalFailed: 7,
          totalSuppressed: 2,
        }),
      );
    });

    it('should produce _all cross-total with zero when no data', async () => {
      await service.aggregate('hourly', periodStart, periodEnd);

      expect(mockAnalyticsRepo.upsertRow).toHaveBeenCalledTimes(1);
      expect(mockAnalyticsRepo.upsertRow).toHaveBeenCalledWith(
        'hourly',
        periodStart,
        expect.objectContaining({
          channel: '_all',
          totalSent: 0,
          totalDelivered: 0,
        }),
      );
    });

    it('should add channels that only appear in suppression data', async () => {
      mockAnalyticsRepo.countSuppressed.mockResolvedValue({ push: 5 });

      await service.aggregate('hourly', periodStart, periodEnd);

      // push channel row + _all cross-total = 2
      expect(mockAnalyticsRepo.upsertRow).toHaveBeenCalledTimes(2);
      expect(mockAnalyticsRepo.upsertRow).toHaveBeenCalledWith(
        'hourly',
        periodStart,
        expect.objectContaining({
          channel: 'push',
          totalSuppressed: 5,
          totalSent: 0,
        }),
      );
    });

    it('should not add _unknown channel from suppression data', async () => {
      mockAnalyticsRepo.countSuppressed.mockResolvedValue({ _unknown: 3 });

      await service.aggregate('hourly', periodStart, periodEnd);

      // Only _all cross-total (no _unknown channel row)
      expect(mockAnalyticsRepo.upsertRow).toHaveBeenCalledTimes(1);
    });

    it('should observe aggregation duration metric', async () => {
      await service.aggregate('daily', periodStart, periodEnd);
      expect(mockMetrics.observeAggregationDuration).toHaveBeenCalledWith(
        'daily',
        expect.any(Number),
      );
    });

    it('should propagate errors', async () => {
      mockAnalyticsRepo.aggregateFromReceipts.mockRejectedValue(
        new Error('DB error'),
      );
      await expect(
        service.aggregate('hourly', periodStart, periodEnd),
      ).rejects.toThrow('DB error');
    });
  });

  describe('runHourlyAggregation', () => {
    it('should compute previous hour period and call aggregate', async () => {
      const aggregateSpy = jest
        .spyOn(service, 'aggregate')
        .mockResolvedValue(undefined);

      await service.runHourlyAggregation();

      expect(aggregateSpy).toHaveBeenCalledWith(
        'hourly',
        expect.any(Date),
        expect.any(Date),
      );

      const [, periodStart, periodEnd] = aggregateSpy.mock.calls[0];
      const diffMs = periodEnd.getTime() - periodStart.getTime();
      expect(diffMs).toBe(3600000); // 1 hour in ms
    });
  });

  describe('runDailyAggregation', () => {
    it('should compute previous day period and call aggregate', async () => {
      const aggregateSpy = jest
        .spyOn(service, 'aggregate')
        .mockResolvedValue(undefined);

      await service.runDailyAggregation();

      expect(aggregateSpy).toHaveBeenCalledWith(
        'daily',
        expect.any(Date),
        expect.any(Date),
      );

      const [, periodStart, periodEnd] = aggregateSpy.mock.calls[0];
      const diffMs = periodEnd.getTime() - periodStart.getTime();
      expect(diffMs).toBe(86400000); // 24 hours in ms
    });
  });
});
