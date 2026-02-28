import { DlqEntriesRepository } from './dlq-entries.repository';
import { DlqEntryStatus } from './entities/dlq-entry.entity';

describe('DlqEntriesRepository', () => {
  let repository: DlqEntriesRepository;
  let mockTypeOrmRepo: any;

  beforeEach(() => {
    mockTypeOrmRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    repository = new DlqEntriesRepository(mockTypeOrmRepo);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('countPending', () => {
    it('should count pending DLQ entries', async () => {
      mockTypeOrmRepo.count.mockResolvedValue(8);

      const result = await repository.countPending();
      expect(result).toBe(8);
      expect(mockTypeOrmRepo.count).toHaveBeenCalledWith({
        where: { status: DlqEntryStatus.PENDING },
      });
    });

    it('should return 0 when no pending entries', async () => {
      mockTypeOrmRepo.count.mockResolvedValue(0);
      const result = await repository.countPending();
      expect(result).toBe(0);
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

    it('should return paginated results with defaults', async () => {
      const result = await repository.findWithFilters({});
      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 50 });
      expect(mockQb.orderBy).toHaveBeenCalledWith('d.capturedAt', 'DESC');
      expect(mockQb.skip).toHaveBeenCalledWith(0);
      expect(mockQb.take).toHaveBeenCalledWith(50);
    });

    it('should filter by status', async () => {
      await repository.findWithFilters({ status: 'pending' });
      expect(mockQb.andWhere).toHaveBeenCalledWith('d.status = :status', {
        status: 'pending',
      });
    });

    it('should filter by originalQueue', async () => {
      await repository.findWithFilters({ originalQueue: 'audit.events' });
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'd.originalQueue = :originalQueue',
        { originalQueue: 'audit.events' },
      );
    });

    it('should filter by from date', async () => {
      await repository.findWithFilters({ from: '2026-01-01T00:00:00Z' });
      expect(mockQb.andWhere).toHaveBeenCalledWith('d.capturedAt >= :from', {
        from: '2026-01-01T00:00:00Z',
      });
    });

    it('should filter by to date', async () => {
      await repository.findWithFilters({ to: '2026-02-01T00:00:00Z' });
      expect(mockQb.andWhere).toHaveBeenCalledWith('d.capturedAt <= :to', {
        to: '2026-02-01T00:00:00Z',
      });
    });

    it('should apply custom pagination', async () => {
      await repository.findWithFilters({ page: 3, limit: 25 });
      expect(mockQb.skip).toHaveBeenCalledWith(50);
      expect(mockQb.take).toHaveBeenCalledWith(25);
    });

    it('should apply all filters together', async () => {
      await repository.findWithFilters({
        status: 'investigated',
        originalQueue: 'audit.deliver',
        from: '2026-01-01T00:00:00Z',
        to: '2026-02-01T00:00:00Z',
        page: 2,
        limit: 10,
      });
      expect(mockQb.andWhere).toHaveBeenCalledTimes(4);
    });
  });

  describe('statusCounts', () => {
    it('should return aggregated counts per status', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { status: 'pending', count: 5 },
          { status: 'investigated', count: 2 },
        ]),
      };
      mockTypeOrmRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await repository.statusCounts();
      expect(result).toEqual({
        pending: 5,
        investigated: 2,
        reprocessed: 0,
        discarded: 0,
      });
    });

    it('should return all zeros when no entries exist', async () => {
      const mockQb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };
      mockTypeOrmRepo.createQueryBuilder.mockReturnValue(mockQb);

      const result = await repository.statusCounts();
      expect(result).toEqual({
        pending: 0,
        investigated: 0,
        reprocessed: 0,
        discarded: 0,
      });
    });
  });

  describe('updateEntry', () => {
    it('should update entry by id', async () => {
      mockTypeOrmRepo.update.mockResolvedValue({ affected: 1 });
      await repository.updateEntry('entry-1', {
        status: DlqEntryStatus.INVESTIGATED,
      });
      expect(mockTypeOrmRepo.update).toHaveBeenCalledWith('entry-1', {
        status: DlqEntryStatus.INVESTIGATED,
      });
    });
  });
});
