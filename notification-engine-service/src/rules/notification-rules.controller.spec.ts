import { Test, TestingModule } from '@nestjs/testing';
import { NotificationRulesController } from './notification-rules.controller.js';
import { NotificationRulesService } from './notification-rules.service.js';
import { NotificationRule } from './entities/notification-rule.entity.js';

describe('NotificationRulesController', () => {
  let controller: NotificationRulesController;
  let service: jest.Mocked<NotificationRulesService>;

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
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationRulesController],
      providers: [{ provide: NotificationRulesService, useValue: mockService }],
    }).compile();

    controller = module.get<NotificationRulesController>(
      NotificationRulesController,
    );
    service = module.get(NotificationRulesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should delegate to service.create', async () => {
      service.create.mockResolvedValue(mockRule);

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

      expect(await controller.create(dto)).toEqual(mockRule);
      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('findAll', () => {
    it('should delegate to service.findAll with query params', async () => {
      const result = { data: [mockRule], total: 1, page: 1, limit: 50 };
      service.findAll.mockResolvedValue(result);

      const query = { page: 1, limit: 50 };
      expect(await controller.findAll(query)).toEqual(result);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findById', () => {
    it('should delegate to service.findById', async () => {
      service.findById.mockResolvedValue(mockRule);

      expect(await controller.findById(mockRule.id)).toEqual(mockRule);
      expect(service.findById).toHaveBeenCalledWith(mockRule.id);
    });
  });

  describe('update', () => {
    it('should delegate to service.update', async () => {
      const updated = { ...mockRule, name: 'Updated Rule' };
      service.update.mockResolvedValue(updated);

      const dto = { name: 'Updated Rule' };
      expect(await controller.update(mockRule.id, dto)).toEqual(updated);
      expect(service.update).toHaveBeenCalledWith(mockRule.id, dto);
    });
  });

  describe('remove', () => {
    it('should delegate to service.softDelete', async () => {
      service.softDelete.mockResolvedValue(undefined);

      await controller.remove(mockRule.id);
      expect(service.softDelete).toHaveBeenCalledWith(mockRule.id);
    });
  });
});
