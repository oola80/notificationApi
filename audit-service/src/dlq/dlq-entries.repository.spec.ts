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
});
