import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeliveryAttemptsRepository } from './delivery-attempts.repository.js';
import { DeliveryAttempt } from './entities/delivery-attempt.entity.js';

describe('DeliveryAttemptsRepository', () => {
  let repository: DeliveryAttemptsRepository;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryAttemptsRepository,
        { provide: getRepositoryToken(DeliveryAttempt), useValue: mockRepo },
      ],
    }).compile();

    repository = module.get<DeliveryAttemptsRepository>(
      DeliveryAttemptsRepository,
    );
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findByNotificationId', () => {
    it('should return attempts for a notification', async () => {
      const attempts = [
        { id: 'a1', notificationId: 'n1', attemptNumber: 1 },
        { id: 'a2', notificationId: 'n1', attemptNumber: 2 },
      ];
      mockRepo.find.mockResolvedValue(attempts);

      const result = await repository.findByNotificationId('n1');
      expect(result).toEqual(attempts);
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { notificationId: 'n1' },
        order: { attemptNumber: 'ASC' },
      });
    });
  });

  describe('findByProviderMessageId', () => {
    it('should return attempt by provider message id', async () => {
      const attempt = { id: 'a1', providerMessageId: 'msg-123' };
      mockRepo.findOne.mockResolvedValue(attempt);

      const result = await repository.findByProviderMessageId('msg-123');
      expect(result).toEqual(attempt);
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { providerMessageId: 'msg-123' },
      });
    });

    it('should return null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await repository.findByProviderMessageId('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('save', () => {
    it('should save a delivery attempt entity', async () => {
      const attempt = { id: 'a1' } as DeliveryAttempt;
      mockRepo.save.mockResolvedValue(attempt);

      const result = await repository.save(attempt);
      expect(result).toEqual(attempt);
    });
  });

  describe('create', () => {
    it('should create and save a new delivery attempt', async () => {
      const data = {
        notificationId: 'n1',
        channel: 'email',
        providerId: 'p1',
        status: 'SENT',
      };
      const entity = { ...data, id: 'a-new' };
      mockRepo.create.mockReturnValue(entity);
      mockRepo.save.mockResolvedValue(entity);

      const result = await repository.create(data);
      expect(result).toEqual(entity);
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated results', async () => {
      const attempts = [{ id: 'a1' }, { id: 'a2' }];
      mockRepo.findAndCount.mockResolvedValue([attempts, 50]);

      const result = await repository.findWithPagination({
        page: 1,
        limit: 10,
      });

      expect(result.data).toEqual(attempts);
      expect(result.total).toBe(50);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });
  });
});
