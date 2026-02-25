import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationsRepository } from './notifications.repository.js';
import { Notification } from './entities/notification.entity.js';

describe('NotificationsRepository', () => {
  let repository: NotificationsRepository;
  let mockTypeOrmRepo: any;
  let mockQueryBuilder: any;

  const mockNotification: Notification = {
    id: '1',
    notificationId: '550e8400-e29b-41d4-a716-446655440000',
    eventId: '660e8400-e29b-41d4-a716-446655440001',
    ruleId: '770e8400-e29b-41d4-a716-446655440002',
    templateId: 'tpl-order-confirm',
    templateVersion: null,
    channel: 'email',
    status: 'PENDING',
    priority: 'normal',
    recipientEmail: 'test@example.com',
    recipientPhone: null,
    recipientName: 'Test User',
    customerId: 'cust-001',
    dedupKeyHash: null,
    dedupKeyValues: null,
    renderedContent: null,
    correlationId: null,
    cycleId: null,
    sourceId: null,
    eventType: 'order.created',
    errorMessage: null,
    createdAt: new Date('2026-02-24T10:00:00Z'),
    updatedAt: new Date('2026-02-24T10:00:00Z'),
  };

  beforeEach(async () => {
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockNotification]),
      getManyAndCount: jest.fn().mockResolvedValue([[mockNotification], 1]),
      getCount: jest.fn().mockResolvedValue(1),
      getOne: jest.fn().mockResolvedValue(mockNotification),
    };

    mockTypeOrmRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsRepository,
        {
          provide: getRepositoryToken(Notification),
          useValue: mockTypeOrmRepo,
        },
      ],
    }).compile();

    repository = module.get<NotificationsRepository>(NotificationsRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findByNotificationId', () => {
    it('should find a notification by UUID', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(mockNotification);

      const result = await repository.findByNotificationId(
        mockNotification.notificationId,
      );

      expect(result).toEqual(mockNotification);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { notificationId: mockNotification.notificationId },
      });
    });

    it('should return null when not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);

      const result = await repository.findByNotificationId('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findWithFilters', () => {
    it('should return paginated results with no filters', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[mockNotification], 1]);

      const result = await repository.findWithFilters({});

      expect(result).toEqual({
        data: [mockNotification],
        total: 1,
        page: 1,
        limit: 50,
      });
    });

    it('should apply status filter', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({ status: 'PENDING' });

      expect(mockTypeOrmRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });

    it('should apply channel filter', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({ channel: 'email' });

      expect(mockTypeOrmRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ channel: 'email' }),
        }),
      );
    });

    it('should apply ruleId filter', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({ ruleId: 'some-rule-id' });

      expect(mockTypeOrmRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ ruleId: 'some-rule-id' }),
        }),
      );
    });

    it('should use query builder for date range filters', async () => {
      await repository.findWithFilters({
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
      });

      expect(mockTypeOrmRepo.createQueryBuilder).toHaveBeenCalledWith('n');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'n.created_at >= :dateFrom',
        { dateFrom: '2026-02-01' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'n.created_at <= :dateTo',
        { dateTo: '2026-02-28' },
      );
    });

    it('should apply pagination', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({ page: 2, limit: 25 });

      expect(mockTypeOrmRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 25, take: 25 }),
      );
    });
  });

  describe('createNotification', () => {
    it('should create and save a notification', async () => {
      mockTypeOrmRepo.create.mockReturnValue(mockNotification);
      mockTypeOrmRepo.save.mockResolvedValue(mockNotification);

      const data = {
        eventId: mockNotification.eventId,
        ruleId: mockNotification.ruleId,
        templateId: mockNotification.templateId,
        channel: 'email',
        status: 'PENDING',
      };

      const result = await repository.createNotification(data);

      expect(result).toEqual(mockNotification);
      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith(data);
      expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(mockNotification);
    });
  });

  describe('updateStatus', () => {
    it('should update notification status', async () => {
      mockTypeOrmRepo.update.mockResolvedValue({ affected: 1 });

      await repository.updateStatus(
        mockNotification.notificationId,
        'PROCESSING',
      );

      expect(mockTypeOrmRepo.update).toHaveBeenCalledWith(
        { notificationId: mockNotification.notificationId },
        { status: 'PROCESSING' },
      );
    });

    it('should update status with error message', async () => {
      mockTypeOrmRepo.update.mockResolvedValue({ affected: 1 });

      await repository.updateStatus(
        mockNotification.notificationId,
        'FAILED',
        'Template rendering error',
      );

      expect(mockTypeOrmRepo.update).toHaveBeenCalledWith(
        { notificationId: mockNotification.notificationId },
        { status: 'FAILED', errorMessage: 'Template rendering error' },
      );
    });
  });

  describe('findForSuppressionCheck', () => {
    it('should query by ruleId, dedupKeyHash, window, and exclude FAILED', async () => {
      const result = await repository.findForSuppressionCheck(
        'rule-1',
        'abc123hash',
        60,
      );

      expect(result).toEqual([mockNotification]);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'n.rule_id = :ruleId',
        { ruleId: 'rule-1' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'n.dedup_key_hash = :dedupKeyHash',
        { dedupKeyHash: 'abc123hash' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'n.created_at >= :windowStart',
        expect.objectContaining({ windowStart: expect.any(Date) }),
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'n.status NOT IN (:...failedStatuses)',
        { failedStatuses: ['FAILED'] },
      );
    });
  });

  describe('countForSuppressionCheck', () => {
    it('should count notifications within window excluding FAILED', async () => {
      const result = await repository.countForSuppressionCheck(
        'rule-1',
        'abc123hash',
        60,
      );

      expect(result).toBe(1);
      expect(mockQueryBuilder.getCount).toHaveBeenCalled();
    });
  });

  describe('findMostRecentForSuppression', () => {
    it('should find the most recent non-FAILED notification', async () => {
      const result = await repository.findMostRecentForSuppression(
        'rule-1',
        'abc123hash',
      );

      expect(result).toEqual(mockNotification);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'n.created_at',
        'DESC',
      );
      expect(mockQueryBuilder.getOne).toHaveBeenCalled();
    });

    it('should return null when no matching notification', async () => {
      mockQueryBuilder.getOne.mockResolvedValue(null);

      const result = await repository.findMostRecentForSuppression(
        'rule-1',
        'abc123hash',
      );

      expect(result).toBeNull();
    });
  });
});
