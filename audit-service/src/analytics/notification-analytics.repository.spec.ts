import { NotificationAnalyticsRepository } from './notification-analytics.repository';

describe('NotificationAnalyticsRepository', () => {
  let repository: NotificationAnalyticsRepository;
  let mockTypeOrmRepo: any;

  beforeEach(() => {
    mockTypeOrmRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    };
    repository = new NotificationAnalyticsRepository(mockTypeOrmRepo);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findWithPagination', () => {
    it('should return paginated analytics results', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);
      const result = await repository.findWithPagination({ page: 1, limit: 50 });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });
});
