import { DeliveryReceiptsRepository } from './delivery-receipts.repository';
import { DeliveryReceipt } from './entities/delivery-receipt.entity';

describe('DeliveryReceiptsRepository', () => {
  let repository: DeliveryReceiptsRepository;
  let mockTypeOrmRepo: any;

  beforeEach(() => {
    mockTypeOrmRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
    };
    repository = new DeliveryReceiptsRepository(mockTypeOrmRepo);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findById', () => {
    it('should find a delivery receipt by id', async () => {
      const receipt = new DeliveryReceipt();
      receipt.id = 'test-uuid';
      receipt.channel = 'email';
      receipt.provider = 'mailgun';
      receipt.status = 'DELIVERED';
      mockTypeOrmRepo.findOne.mockResolvedValue(receipt);

      const result = await repository.findById('test-uuid');
      expect(result).toBe(receipt);
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated results', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);
      const result = await repository.findWithPagination({ page: 1, limit: 20 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
