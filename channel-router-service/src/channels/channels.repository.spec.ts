import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChannelsRepository } from './channels.repository.js';
import { Channel } from './entities/channel.entity.js';

describe('ChannelsRepository', () => {
  let repository: ChannelsRepository;
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
        ChannelsRepository,
        { provide: getRepositoryToken(Channel), useValue: mockRepo },
      ],
    }).compile();

    repository = module.get<ChannelsRepository>(ChannelsRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findById', () => {
    it('should return a channel by id', async () => {
      const channel = { id: 'uuid-1', name: 'Email', type: 'email' };
      mockRepo.findOne.mockResolvedValue(channel);

      const result = await repository.findById('uuid-1');
      expect(result).toEqual(channel);
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'uuid-1' },
      });
    });

    it('should return null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findByType', () => {
    it('should return a channel by type', async () => {
      const channel = { id: 'uuid-1', type: 'email' };
      mockRepo.findOne.mockResolvedValue(channel);

      const result = await repository.findByType('email');
      expect(result).toEqual(channel);
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { type: 'email' },
      });
    });
  });

  describe('findAllActive', () => {
    it('should return all active channels', async () => {
      const channels = [
        { id: 'uuid-1', name: 'Email', isActive: true },
        { id: 'uuid-2', name: 'SMS', isActive: true },
      ];
      mockRepo.find.mockResolvedValue(channels);

      const result = await repository.findAllActive();
      expect(result).toEqual(channels);
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { isActive: true },
        order: { name: 'ASC' },
      });
    });
  });

  describe('save', () => {
    it('should save a channel entity', async () => {
      const channel = { id: 'uuid-1', name: 'Email' } as Channel;
      mockRepo.save.mockResolvedValue(channel);

      const result = await repository.save(channel);
      expect(result).toEqual(channel);
      expect(mockRepo.save).toHaveBeenCalledWith(channel);
    });
  });

  describe('create', () => {
    it('should create and save a new channel', async () => {
      const data = { name: 'Email', type: 'email' };
      const entity = { ...data, id: 'uuid-new' };
      mockRepo.create.mockReturnValue(entity);
      mockRepo.save.mockResolvedValue(entity);

      const result = await repository.create(data);
      expect(result).toEqual(entity);
      expect(mockRepo.create).toHaveBeenCalledWith(data);
      expect(mockRepo.save).toHaveBeenCalledWith(entity);
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated results', async () => {
      const channels = [{ id: 'uuid-1' }, { id: 'uuid-2' }];
      mockRepo.findAndCount.mockResolvedValue([channels, 10]);

      const result = await repository.findWithPagination({
        page: 2,
        limit: 2,
      });

      expect(result.data).toEqual(channels);
      expect(result.total).toBe(10);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(2);
    });
  });
});
