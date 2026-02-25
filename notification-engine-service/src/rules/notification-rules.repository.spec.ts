import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationRulesRepository } from './notification-rules.repository.js';
import { NotificationRule } from './entities/notification-rule.entity.js';

describe('NotificationRulesRepository', () => {
  let repository: NotificationRulesRepository;
  let mockTypeOrmRepo: any;

  const mockRule: NotificationRule = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Order Confirmation',
    description: null,
    eventType: 'order.created',
    conditions: { status: 'confirmed' },
    actions: [
      {
        templateId: 'tpl-order-confirm',
        channels: ['email'],
        recipientType: 'customer',
      },
    ],
    suppression: null,
    deliveryPriority: null,
    priority: 100,
    isExclusive: false,
    isActive: true,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockQueryBuilder: any;

  beforeEach(async () => {
    mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockRule]),
      getCount: jest.fn().mockResolvedValue(0),
    };

    mockTypeOrmRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationRulesRepository,
        {
          provide: getRepositoryToken(NotificationRule),
          useValue: mockTypeOrmRepo,
        },
      ],
    }).compile();

    repository = module.get<NotificationRulesRepository>(
      NotificationRulesRepository,
    );
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findByEventType', () => {
    it('should query active rules by event type ordered by priority', async () => {
      const result = await repository.findByEventType('order.created');

      expect(result).toEqual([mockRule]);
      expect(mockTypeOrmRepo.createQueryBuilder).toHaveBeenCalledWith('rule');
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'rule.event_type = :eventType',
        { eventType: 'order.created' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rule.is_active = true',
      );
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'rule.priority',
        'ASC',
      );
    });

    it('should not filter by isActive when activeOnly is false', async () => {
      await repository.findByEventType('order.created', false);

      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
    });
  });

  describe('findAllActive', () => {
    it('should find all active rules ordered by priority', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([mockRule]);

      const result = await repository.findAllActive();

      expect(result).toEqual([mockRule]);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { priority: 'ASC' },
      });
    });
  });

  describe('existsActiveDuplicate', () => {
    it('should check for duplicates using JSONB containment', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(1);

      const result = await repository.existsActiveDuplicate('order.created', {
        status: 'confirmed',
      });

      expect(result).toBe(true);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'rule.event_type = :eventType',
        { eventType: 'order.created' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rule.is_active = true',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rule.conditions @> :conditions',
        { conditions: JSON.stringify({ status: 'confirmed' }) },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rule.conditions <@ :conditions',
        { conditions: JSON.stringify({ status: 'confirmed' }) },
      );
    });

    it('should check for null conditions with IS NULL', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      const result = await repository.existsActiveDuplicate(
        'order.created',
        null,
      );

      expect(result).toBe(false);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rule.conditions IS NULL',
      );
    });

    it('should exclude a specific rule by id', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      await repository.existsActiveDuplicate(
        'order.created',
        { status: 'confirmed' },
        mockRule.id,
      );

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'rule.id != :excludeId',
        { excludeId: mockRule.id },
      );
    });

    it('should return false when no duplicate found', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      const result = await repository.existsActiveDuplicate('order.created', {
        status: 'confirmed',
      });

      expect(result).toBe(false);
    });
  });

  describe('save', () => {
    it('should delegate to typeorm save', async () => {
      mockTypeOrmRepo.save.mockResolvedValue(mockRule);

      const result = await repository.save(mockRule);

      expect(result).toEqual(mockRule);
      expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(mockRule);
    });
  });

  describe('create', () => {
    it('should create and save a new entity', async () => {
      mockTypeOrmRepo.create.mockReturnValue(mockRule);
      mockTypeOrmRepo.save.mockResolvedValue(mockRule);

      const data = {
        name: 'Order Confirmation',
        eventType: 'order.created',
        actions: [
          {
            templateId: 'tpl-order-confirm',
            channels: ['email'],
            recipientType: 'customer',
          },
        ],
      };

      const result = await repository.create(data);

      expect(result).toEqual(mockRule);
      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith(data);
      expect(mockTypeOrmRepo.save).toHaveBeenCalledWith(mockRule);
    });
  });
});
