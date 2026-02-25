import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CriticalChannelOverridesRepository } from './critical-channel-overrides.repository.js';
import { CriticalChannelOverride } from './entities/critical-channel-override.entity.js';

const mockOverride = {
  id: 'ooo-ppp-qqq',
  eventType: 'order.created',
  channel: 'email',
  reason: null,
  isActive: true,
  createdBy: null,
  updatedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockQueryBuilder = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  getCount: jest.fn().mockResolvedValue(0),
};

describe('CriticalChannelOverridesRepository', () => {
  let repository: CriticalChannelOverridesRepository;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      find: jest.fn().mockResolvedValue([mockOverride]),
      findOne: jest.fn().mockResolvedValue(mockOverride),
      create: jest.fn().mockReturnValue(mockOverride),
      save: jest.fn().mockResolvedValue(mockOverride),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      findAndCount: jest.fn().mockResolvedValue([[mockOverride], 1]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CriticalChannelOverridesRepository,
        {
          provide: getRepositoryToken(CriticalChannelOverride),
          useValue: mockRepo,
        },
      ],
    }).compile();

    repository = module.get<CriticalChannelOverridesRepository>(
      CriticalChannelOverridesRepository,
    );
  });

  describe('findActiveByEventType', () => {
    it('should find active overrides for event type', async () => {
      const result = await repository.findActiveByEventType('order.created');
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { eventType: 'order.created', isActive: true },
      });
      expect(result).toEqual([mockOverride]);
    });
  });

  describe('findAllActive', () => {
    it('should find all active overrides', async () => {
      const result = await repository.findAllActive();
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { isActive: true },
      });
      expect(result).toEqual([mockOverride]);
    });
  });

  describe('existsActiveOverride', () => {
    it('should check for existing active override', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(1);
      const result = await repository.existsActiveOverride(
        'order.created',
        'email',
      );
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'override.event_type = :eventType',
        { eventType: 'order.created' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'override.channel = :channel',
        { channel: 'email' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'override.is_active = true',
      );
      expect(result).toBe(true);
    });

    it('should return false when no override exists', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      const result = await repository.existsActiveOverride(
        'order.created',
        'sms',
      );
      expect(result).toBe(false);
    });

    it('should exclude specified ID', async () => {
      mockQueryBuilder.getCount.mockResolvedValue(0);
      await repository.existsActiveOverride(
        'order.created',
        'email',
        'exclude-id',
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'override.id != :excludeId',
        { excludeId: 'exclude-id' },
      );
    });
  });

  describe('create', () => {
    it('should create and save entity', async () => {
      const data = { eventType: 'order.created', channel: 'email' };
      await repository.create(data);
      expect(mockRepo.create).toHaveBeenCalledWith(data);
      expect(mockRepo.save).toHaveBeenCalled();
    });
  });

  describe('save', () => {
    it('should save entity', async () => {
      await repository.save(mockOverride as any);
      expect(mockRepo.save).toHaveBeenCalledWith(mockOverride);
    });
  });
});
