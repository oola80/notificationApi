import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ChannelConfigsRepository } from './channel-configs.repository.js';
import { ChannelConfig } from './entities/channel-config.entity.js';

describe('ChannelConfigsRepository', () => {
  let repository: ChannelConfigsRepository;
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
        ChannelConfigsRepository,
        { provide: getRepositoryToken(ChannelConfig), useValue: mockRepo },
      ],
    }).compile();

    repository = module.get<ChannelConfigsRepository>(ChannelConfigsRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findByChannelId', () => {
    it('should return configs for a channel', async () => {
      const configs = [
        { id: 'c1', channelId: 'ch1', configKey: 'fromAddress' },
        { id: 'c2', channelId: 'ch1', configKey: 'senderName' },
      ];
      mockRepo.find.mockResolvedValue(configs);

      const result = await repository.findByChannelId('ch1');
      expect(result).toEqual(configs);
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { channelId: 'ch1' },
        order: { configKey: 'ASC' },
      });
    });
  });

  describe('save', () => {
    it('should save a config entity', async () => {
      const config = { id: 'c1', configKey: 'fromAddress' } as ChannelConfig;
      mockRepo.save.mockResolvedValue(config);

      const result = await repository.save(config);
      expect(result).toEqual(config);
    });
  });

  describe('create', () => {
    it('should create and save a new config', async () => {
      const data = {
        channelId: 'ch1',
        configKey: 'fromAddress',
        configValue: 'noreply@test.com',
      };
      const entity = { ...data, id: 'c-new' };
      mockRepo.create.mockReturnValue(entity);
      mockRepo.save.mockResolvedValue(entity);

      const result = await repository.create(data);
      expect(result).toEqual(entity);
    });
  });
});
