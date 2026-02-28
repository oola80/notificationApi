import { AuditEventsRepository } from './audit-events.repository';
import { AuditEvent } from './entities/audit-event.entity';

describe('AuditEventsRepository', () => {
  let repository: AuditEventsRepository;
  let mockTypeOrmRepo: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    mockQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    mockTypeOrmRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };
    repository = new AuditEventsRepository(mockTypeOrmRepo);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findById', () => {
    it('should find an audit event by id', async () => {
      const event = new AuditEvent();
      event.id = 'test-uuid';
      event.eventType = 'DELIVERY_SENT';
      event.actor = 'channel-router-service';
      mockTypeOrmRepo.findOne.mockResolvedValue(event);

      const result = await repository.findById('test-uuid');
      expect(result).toBe(event);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'test-uuid' },
      });
    });

    it('should return null when not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);
      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated results', async () => {
      const events = [new AuditEvent(), new AuditEvent()];
      mockTypeOrmRepo.findAndCount.mockResolvedValue([events, 2]);

      const result = await repository.findWithPagination({
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should use default pagination values', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await repository.findWithPagination({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(mockTypeOrmRepo.findAndCount).toHaveBeenCalledWith({
        where: undefined,
        order: undefined,
        skip: 0,
        take: 50,
      });
    });
  });

  describe('findWithFilters', () => {
    it('should return results with no filters', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await repository.findWithFilters({});

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'ae.createdAt',
        'DESC',
      );
    });

    it('should filter by notificationId', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({ notificationId: 'n-123' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.notificationId = :notificationId',
        { notificationId: 'n-123' },
      );
    });

    it('should filter by correlationId', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({ correlationId: 'c-456' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.correlationId = :correlationId',
        { correlationId: 'c-456' },
      );
    });

    it('should filter by cycleId', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({ cycleId: 'cy-789' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.cycleId = :cycleId',
        { cycleId: 'cy-789' },
      );
    });

    it('should filter by eventType', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({ eventType: 'DELIVERY_SENT' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.eventType = :eventType',
        { eventType: 'DELIVERY_SENT' },
      );
    });

    it('should filter by actor', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({ actor: 'channel-router-service' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.actor = :actor',
        { actor: 'channel-router-service' },
      );
    });

    it('should filter by date range', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-31T23:59:59Z',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.createdAt >= :from',
        { from: '2026-01-01T00:00:00Z' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.createdAt <= :to',
        { to: '2026-01-31T23:59:59Z' },
      );
    });

    it('should apply inline full-text search when q is provided', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({ q: 'order delay' });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.search_vector @@ plainto_tsquery(:q)',
        { q: 'order delay' },
      );
    });

    it('should combine multiple filters', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({
        notificationId: 'n-1',
        eventType: 'DELIVERY_SENT',
        actor: 'crs',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(3);
    });

    it('should use provided page and limit', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({ page: 3, limit: 25 });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(50);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(25);
    });
  });

  describe('fullTextSearch', () => {
    it('should use plainto_tsquery by default', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.fullTextSearch({ query: 'order delay' });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'ae.search_vector @@ plainto_tsquery(:query)',
        { query: 'order delay' },
      );
      expect(mockQueryBuilder.addSelect).toHaveBeenCalledWith(
        'ts_rank_cd(ae.search_vector, plainto_tsquery(:query))',
        'rank',
      );
    });

    it('should use to_tsquery when useRawTsquery is true', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.fullTextSearch({
        query: 'order & delay',
        useRawTsquery: true,
      });

      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'ae.search_vector @@ to_tsquery(:query)',
        { query: 'order & delay' },
      );
    });

    it('should order by rank DESC then createdAt DESC', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.fullTextSearch({ query: 'test' });

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('rank', 'DESC');
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith(
        'ae.createdAt',
        'DESC',
      );
    });

    it('should filter by date range in search', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await repository.fullTextSearch({
        query: 'test',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-31T23:59:59Z',
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.createdAt >= :from',
        { from: '2026-01-01T00:00:00Z' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'ae.createdAt <= :to',
        { to: '2026-01-31T23:59:59Z' },
      );
    });

    it('should paginate search results', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      const result = await repository.fullTextSearch({
        query: 'test',
        page: 2,
        limit: 20,
      });

      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
    });
  });

  describe('findByNotificationIdOrdered', () => {
    it('should find events by notificationId ordered by createdAt ASC', async () => {
      const events = [new AuditEvent(), new AuditEvent()];
      mockTypeOrmRepo.find.mockResolvedValue(events);

      const result =
        await repository.findByNotificationIdOrdered('n-123');

      expect(result).toBe(events);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { notificationId: 'n-123' },
        order: { createdAt: 'ASC' },
      });
    });

    it('should return empty array when no events found', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      const result =
        await repository.findByNotificationIdOrdered('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findDistinctNotificationIds', () => {
    it('should find distinct notification IDs by correlationId', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { notificationId: 'n-1' },
        { notificationId: 'n-2' },
      ]);

      const result = await repository.findDistinctNotificationIds(
        'correlationId',
        'c-123',
      );

      expect(result).toEqual(['n-1', 'n-2']);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'ae.correlation_id = :value',
        { value: 'c-123' },
      );
    });

    it('should find distinct notification IDs by cycleId', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { notificationId: 'n-3' },
      ]);

      const result = await repository.findDistinctNotificationIds(
        'cycleId',
        'cy-456',
      );

      expect(result).toEqual(['n-3']);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'ae.cycle_id = :value',
        { value: 'cy-456' },
      );
    });

    it('should return empty array when no IDs found', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await repository.findDistinctNotificationIds(
        'correlationId',
        'nonexistent',
      );

      expect(result).toEqual([]);
    });
  });
});
