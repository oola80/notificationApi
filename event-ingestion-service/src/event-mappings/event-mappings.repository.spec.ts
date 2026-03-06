import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventMappingsRepository } from './event-mappings.repository.js';
import { EventMapping } from './entities/event-mapping.entity.js';

describe('EventMappingsRepository', () => {
  let repo: EventMappingsRepository;

  const mockMapping: EventMapping = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    sourceId: 'shopify',
    eventType: 'order.created',
    name: 'Shopify Order Created',
    description: null,
    fieldMappings: { orderId: { source: 'id', target: 'orderId' } },
    eventTypeMapping: null,
    timestampField: null,
    timestampFormat: 'iso8601',
    sourceEventIdField: null,
    validationSchema: null,
    priority: 'normal',
    isActive: true,
    version: 1,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn(),
  };

  const mockTypeOrmRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventMappingsRepository,
        {
          provide: getRepositoryToken(EventMapping),
          useValue: mockTypeOrmRepo,
        },
      ],
    }).compile();

    repo = module.get<EventMappingsRepository>(EventMappingsRepository);
  });

  describe('findBySourceAndType', () => {
    it('should return matching active mapping', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(mockMapping);

      const result = await repo.findBySourceAndType('shopify', 'order.created');

      expect(result).toEqual(mockMapping);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { sourceId: 'shopify', eventType: 'order.created', isActive: true },
      });
    });

    it('should return null when no match', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);

      const result = await repo.findBySourceAndType('unknown', 'order.created');

      expect(result).toBeNull();
    });

    it('should include isActive: true in where clause (soft-delete exclusion)', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);

      await repo.findBySourceAndType('shopify', 'order.created');

      const callArgs = mockTypeOrmRepo.findOne.mock.calls[0][0];
      expect(callArgs.where.isActive).toBe(true);
    });
  });

  describe('existsActiveMapping', () => {
    it('should return true when count > 0', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(1);

      const result = await repo.existsActiveMapping('shopify', 'order.created');

      expect(result).toBe(true);
    });

    it('should return false when count = 0', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);

      const result = await repo.existsActiveMapping('shopify', 'order.created');

      expect(result).toBe(false);
    });
  });
});
