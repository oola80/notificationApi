import { Repository, ObjectLiteral } from 'typeorm';
import { PgBaseRepository, PaginatedResult } from './pg-base.repository.js';

interface TestEntity extends ObjectLiteral {
  id: string;
  name: string;
}

class TestRepository extends PgBaseRepository<TestEntity> {
  constructor(repository: Repository<TestEntity>) {
    super(repository);
  }
}

describe('PgBaseRepository', () => {
  let testRepo: TestRepository;
  let mockRepository: jest.Mocked<Repository<TestEntity>>;

  beforeEach(() => {
    mockRepository = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    } as any;

    testRepo = new TestRepository(mockRepository);
  });

  describe('findById', () => {
    it('should find entity by id', async () => {
      const entity: TestEntity = { id: '1', name: 'Test' };
      mockRepository.findOne.mockResolvedValue(entity);

      const result = await testRepo.findById('1');

      expect(result).toEqual(entity);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should return null when entity not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await testRepo.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated results with defaults', async () => {
      const entities: TestEntity[] = [
        { id: '1', name: 'Test 1' },
        { id: '2', name: 'Test 2' },
      ];
      mockRepository.findAndCount.mockResolvedValue([entities, 2]);

      const result: PaginatedResult<TestEntity> =
        await testRepo.findWithPagination({});

      expect(result.data).toEqual(entities);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: undefined,
        order: undefined,
        skip: 0,
        take: 50,
      });
    });

    it('should apply page and limit', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await testRepo.findWithPagination({ page: 3, limit: 10 });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: undefined,
        order: undefined,
        skip: 20,
        take: 10,
      });
    });

    it('should apply where clause', async () => {
      mockRepository.findAndCount.mockResolvedValue([[], 0]);

      await testRepo.findWithPagination({
        where: { name: 'Test' } as any,
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { name: 'Test' },
        }),
      );
    });
  });
});
