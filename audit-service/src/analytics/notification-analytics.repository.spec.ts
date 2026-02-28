import { NotificationAnalyticsRepository } from './notification-analytics.repository';

describe('NotificationAnalyticsRepository', () => {
  let repository: NotificationAnalyticsRepository;
  let mockTypeOrmRepo: any;
  let mockDataSource: any;

  beforeEach(() => {
    mockTypeOrmRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    mockDataSource = {
      query: jest.fn(),
    };
    repository = new NotificationAnalyticsRepository(
      mockTypeOrmRepo,
      mockDataSource,
    );
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findWithPagination', () => {
    it('should return paginated analytics results', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);
      const result = await repository.findWithPagination({
        page: 1,
        limit: 50,
      });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findWithFilters', () => {
    let mockQb: any;

    beforeEach(() => {
      mockQb = {
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      mockTypeOrmRepo.createQueryBuilder.mockReturnValue(mockQb);
    });

    it('should apply period and date filters', async () => {
      await repository.findWithFilters({
        period: 'daily',
        from: '2026-02-01',
        to: '2026-02-28',
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith('na.period = :period', {
        period: 'daily',
      });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'na.periodStart >= :from',
        { from: '2026-02-01' },
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith('na.periodStart <= :to', {
        to: '2026-02-28',
      });
    });

    it('should filter by channel', async () => {
      await repository.findWithFilters({
        period: 'daily',
        from: '2026-02-01',
        to: '2026-02-28',
        channel: 'email',
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith('na.channel = :channel', {
        channel: 'email',
      });
    });

    it('should filter by eventType', async () => {
      await repository.findWithFilters({
        period: 'hourly',
        from: '2026-02-28T00:00:00Z',
        to: '2026-02-28T23:59:59Z',
        eventType: 'order.delay',
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'na.eventType = :eventType',
        { eventType: 'order.delay' },
      );
    });

    it('should apply pagination', async () => {
      await repository.findWithFilters({
        period: 'daily',
        from: '2026-02-01',
        to: '2026-02-28',
        page: 3,
        limit: 25,
      });

      expect(mockQb.skip).toHaveBeenCalledWith(50);
      expect(mockQb.take).toHaveBeenCalledWith(25);
    });
  });

  describe('upsertRow', () => {
    it('should execute upsert query with correct params', async () => {
      mockDataSource.query.mockResolvedValue(undefined);

      const row = {
        channel: 'email',
        eventType: null,
        totalSent: 100,
        totalDelivered: 90,
        totalFailed: 5,
        totalOpened: 50,
        totalClicked: 20,
        totalBounced: 3,
        totalSuppressed: 2,
        avgLatencyMs: 150.5,
      };

      await repository.upsertRow(
        'hourly',
        new Date('2026-02-28T10:00:00Z'),
        row,
      );

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notification_analytics'),
        [
          'hourly',
          new Date('2026-02-28T10:00:00Z'),
          'email',
          null,
          100,
          90,
          5,
          50,
          20,
          3,
          2,
          150.5,
        ],
      );
    });

    it('should include ON CONFLICT clause for idempotent upsert', async () => {
      mockDataSource.query.mockResolvedValue(undefined);

      await repository.upsertRow('daily', new Date(), {
        channel: '_all',
        eventType: null,
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalOpened: 0,
        totalClicked: 0,
        totalBounced: 0,
        totalSuppressed: 0,
        avgLatencyMs: null,
      });

      const sql = mockDataSource.query.mock.calls[0][0];
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain("COALESCE(event_type, '')");
      expect(sql).toContain('DO UPDATE SET');
    });
  });

  describe('aggregateFromReceipts', () => {
    it('should query delivery_receipts grouped by channel', async () => {
      mockDataSource.query.mockResolvedValue([
        {
          channel: 'email',
          total_sent: 100,
          total_delivered: 90,
          total_failed: 5,
          total_opened: 50,
          total_clicked: 20,
          total_bounced: 3,
        },
      ]);

      const result = await repository.aggregateFromReceipts(
        new Date('2026-02-28T10:00:00Z'),
        new Date('2026-02-28T11:00:00Z'),
      );

      expect(result).toHaveLength(1);
      expect(result[0].channel).toBe('email');
      expect(result[0].totalSent).toBe(100);
      expect(result[0].totalDelivered).toBe(90);
      expect(result[0].totalSuppressed).toBe(0);
      expect(result[0].eventType).toBeNull();
    });

    it('should return empty array when no receipts', async () => {
      mockDataSource.query.mockResolvedValue([]);
      const result = await repository.aggregateFromReceipts(
        new Date(),
        new Date(),
      );
      expect(result).toEqual([]);
    });
  });

  describe('countSuppressed', () => {
    it('should return suppressed counts per channel', async () => {
      mockDataSource.query.mockResolvedValue([
        { channel: 'email', count: 5 },
        { channel: 'sms', count: 2 },
      ]);

      const result = await repository.countSuppressed(
        new Date(),
        new Date(),
      );

      expect(result).toEqual({ email: 5, sms: 2 });
    });

    it('should return empty object when no suppressions', async () => {
      mockDataSource.query.mockResolvedValue([]);
      const result = await repository.countSuppressed(
        new Date(),
        new Date(),
      );
      expect(result).toEqual({});
    });
  });

  describe('findForSummary', () => {
    let mockQb: any;

    beforeEach(() => {
      mockQb = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      mockTypeOrmRepo.createQueryBuilder.mockReturnValue(mockQb);
    });

    it('should query by period and date range', async () => {
      await repository.findForSummary(
        'hourly',
        new Date('2026-02-28T00:00:00Z'),
        new Date('2026-03-01T00:00:00Z'),
      );

      expect(mockQb.where).toHaveBeenCalledWith('na.period = :period', {
        period: 'hourly',
      });
      expect(mockQb.orderBy).toHaveBeenCalledWith('na.periodStart', 'ASC');
    });

    it('should filter by channel when provided', async () => {
      await repository.findForSummary(
        'daily',
        new Date(),
        new Date(),
        'email',
      );

      expect(mockQb.andWhere).toHaveBeenCalledWith('na.channel = :channel', {
        channel: 'email',
      });
    });
  });
});
