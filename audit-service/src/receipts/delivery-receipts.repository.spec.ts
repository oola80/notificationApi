import { DeliveryReceiptsRepository } from './delivery-receipts.repository';
import { DeliveryReceipt } from './entities/delivery-receipt.entity';

describe('DeliveryReceiptsRepository', () => {
  let repository: DeliveryReceiptsRepository;
  let mockTypeOrmRepo: any;

  beforeEach(() => {
    mockTypeOrmRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      find: jest.fn(),
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
      const result = await repository.findWithPagination({
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('findByNotificationIdOrdered', () => {
    it('should find receipts ordered by receivedAt ASC', async () => {
      const receipts = [new DeliveryReceipt(), new DeliveryReceipt()];
      mockTypeOrmRepo.find.mockResolvedValue(receipts);

      const result =
        await repository.findByNotificationIdOrdered('n-123');

      expect(result).toBe(receipts);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { notificationId: 'n-123' },
        order: { receivedAt: 'ASC' },
      });
    });

    it('should return empty array when none found', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      const result =
        await repository.findByNotificationIdOrdered('nonexistent');

      expect(result).toEqual([]);
    });
  });

  describe('findByNotificationId', () => {
    it('should find all receipts for a notification', async () => {
      const receipts = [new DeliveryReceipt()];
      mockTypeOrmRepo.find.mockResolvedValue(receipts);

      const result = await repository.findByNotificationId('n-123');

      expect(result).toBe(receipts);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { notificationId: 'n-123' },
      });
    });

    it('should return empty array when none found', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      const result = await repository.findByNotificationId('nonexistent');

      expect(result).toEqual([]);
    });
  });
});
