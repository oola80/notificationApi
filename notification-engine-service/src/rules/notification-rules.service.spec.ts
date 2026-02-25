import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationRulesService } from './notification-rules.service.js';
import { NotificationRulesRepository } from './notification-rules.repository.js';
import { NotificationPublisherService } from '../rabbitmq/notification-publisher.service.js';
import { NotificationRule } from './entities/notification-rule.entity.js';

describe('NotificationRulesService', () => {
  let service: NotificationRulesService;
  let repository: jest.Mocked<NotificationRulesRepository>;

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

  beforeEach(async () => {
    const mockRepository = {
      findById: jest.fn(),
      findWithPagination: jest.fn(),
      findByEventType: jest.fn(),
      findAllActive: jest.fn(),
      existsActiveDuplicate: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationRulesService,
        { provide: NotificationRulesRepository, useValue: mockRepository },
        {
          provide: NotificationPublisherService,
          useValue: { publishConfigEvent: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(false),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationRulesService>(NotificationRulesService);
    repository = module.get(NotificationRulesRepository);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new rule when no duplicate exists', async () => {
      repository.existsActiveDuplicate.mockResolvedValue(false);
      repository.create.mockResolvedValue(mockRule);

      const dto = {
        name: 'Order Confirmation',
        eventType: 'order.created',
        actions: [
          {
            templateId: 'tpl-order-confirm',
            channels: ['email'],
            recipientType: 'customer',
          },
        ],
        conditions: { status: 'confirmed' },
      };

      const result = await service.create(dto);
      expect(result).toEqual(mockRule);
      expect(repository.existsActiveDuplicate).toHaveBeenCalledWith(
        'order.created',
        { status: 'confirmed' },
      );
    });

    it('should throw NES-006 when duplicate exists', async () => {
      repository.existsActiveDuplicate.mockResolvedValue(true);

      const dto = {
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

      try {
        await service.create(dto);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-006');
      }
    });

    it('should apply default values for optional fields', async () => {
      repository.existsActiveDuplicate.mockResolvedValue(false);
      repository.create.mockResolvedValue(mockRule);

      const dto = {
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

      await service.create(dto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conditions: null,
          suppression: null,
          deliveryPriority: null,
          priority: 100,
          isExclusive: false,
          createdBy: null,
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const result = { data: [mockRule], total: 1, page: 1, limit: 50 };
      repository.findWithPagination.mockResolvedValue(result);

      const response = await service.findAll({ page: 1, limit: 50 });

      expect(response).toEqual(result);
      expect(repository.findWithPagination).toHaveBeenCalledWith({
        where: {},
        page: 1,
        limit: 50,
        order: { createdAt: 'DESC' },
      });
    });

    it('should apply eventType filter', async () => {
      const result = { data: [], total: 0, page: 1, limit: 50 };
      repository.findWithPagination.mockResolvedValue(result);

      await service.findAll({ eventType: 'order.created', page: 1, limit: 50 });

      expect(repository.findWithPagination).toHaveBeenCalledWith({
        where: { eventType: 'order.created' },
        page: 1,
        limit: 50,
        order: { createdAt: 'DESC' },
      });
    });

    it('should apply isActive filter', async () => {
      const result = { data: [], total: 0, page: 1, limit: 50 };
      repository.findWithPagination.mockResolvedValue(result);

      await service.findAll({ isActive: true, page: 1, limit: 50 });

      expect(repository.findWithPagination).toHaveBeenCalledWith({
        where: { isActive: true },
        page: 1,
        limit: 50,
        order: { createdAt: 'DESC' },
      });
    });

    it('should apply both filters when provided', async () => {
      const result = { data: [], total: 0, page: 1, limit: 50 };
      repository.findWithPagination.mockResolvedValue(result);

      await service.findAll({
        eventType: 'order.shipped',
        isActive: true,
        page: 1,
        limit: 50,
      });

      expect(repository.findWithPagination).toHaveBeenCalledWith({
        where: { eventType: 'order.shipped', isActive: true },
        page: 1,
        limit: 50,
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findById', () => {
    it('should return the rule when found', async () => {
      repository.findById.mockResolvedValue(mockRule);

      const result = await service.findById(mockRule.id);
      expect(result).toEqual(mockRule);
    });

    it('should throw NES-002 when not found', async () => {
      repository.findById.mockResolvedValue(null);

      try {
        await service.findById('nonexistent-id');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-002');
      }
    });
  });

  describe('update', () => {
    it('should update the rule with provided fields', async () => {
      repository.findById.mockResolvedValue({ ...mockRule });
      repository.save.mockImplementation(async (entity) => entity);

      const result = await service.update(mockRule.id, {
        name: 'Updated Rule',
      });

      expect(result.name).toBe('Updated Rule');
      expect(repository.save).toHaveBeenCalled();
    });

    it('should only update fields that are provided', async () => {
      const original = { ...mockRule };
      repository.findById.mockResolvedValue(original);
      repository.save.mockImplementation(async (entity) => entity);

      const result = await service.update(mockRule.id, {
        name: 'Updated',
        updatedBy: 'admin',
      });

      expect(result.name).toBe('Updated');
      expect(result.updatedBy).toBe('admin');
      expect(result.priority).toBe(100);
      expect(result.isExclusive).toBe(false);
    });

    it('should throw NES-002 when rule not found', async () => {
      repository.findById.mockResolvedValue(null);

      try {
        await service.update('nonexistent', { name: 'Test' });
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-002');
      }
    });
  });

  describe('softDelete', () => {
    it('should set isActive to false', async () => {
      repository.findById.mockResolvedValue({ ...mockRule });
      repository.save.mockImplementation(async (entity) => entity);

      await service.softDelete(mockRule.id);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it('should throw NES-002 when rule not found', async () => {
      repository.findById.mockResolvedValue(null);

      try {
        await service.softDelete('nonexistent');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('NES-002');
      }
    });
  });
});
