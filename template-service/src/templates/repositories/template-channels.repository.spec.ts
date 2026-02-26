import { TemplateChannelsRepository } from './template-channels.repository.js';
import { TemplateChannel } from '../entities/template-channel.entity.js';

describe('TemplateChannelsRepository', () => {
  let repository: TemplateChannelsRepository;
  let mockTypeOrmRepo: any;

  beforeEach(() => {
    mockTypeOrmRepo = {
      create: jest.fn((data: any) => {
        if (Array.isArray(data))
          return data.map((d) => ({ id: 'ch-id', ...d }));
        return { id: 'ch-id', ...data };
      }),
      save: jest.fn((entities: any) => {
        if (Array.isArray(entities))
          return Promise.resolve(
            entities.map((e: any) => ({ id: 'ch-id', ...e })),
          );
        return Promise.resolve({ id: 'ch-id', ...entities });
      }),
      find: jest.fn(),
    };

    repository = new TemplateChannelsRepository(mockTypeOrmRepo);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('createBatch', () => {
    it('should create and save multiple channels', async () => {
      const channels: Partial<TemplateChannel>[] = [
        {
          templateVersionId: 'v-id',
          channel: 'email',
          subject: 'Subject',
          body: 'Body',
          metadata: {},
        },
        {
          templateVersionId: 'v-id',
          channel: 'sms',
          body: 'SMS body',
          metadata: {},
        },
      ];

      const result = await repository.createBatch(channels);

      expect(mockTypeOrmRepo.create).toHaveBeenCalledWith(channels);
      expect(mockTypeOrmRepo.save).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });

    it('should handle empty array', async () => {
      mockTypeOrmRepo.create.mockReturnValue([]);
      mockTypeOrmRepo.save.mockResolvedValue([]);

      const result = await repository.createBatch([]);

      expect(result).toEqual([]);
    });
  });

  describe('findByVersionId', () => {
    it('should return channels ordered by channel ASC', async () => {
      const mockChannels = [
        { id: 'c1', channel: 'email', body: 'Email body' },
        { id: 'c2', channel: 'sms', body: 'SMS body' },
      ];
      mockTypeOrmRepo.find.mockResolvedValue(mockChannels);

      const result = await repository.findByVersionId('v-id');

      expect(result).toEqual(mockChannels);
      expect(mockTypeOrmRepo.find).toHaveBeenCalledWith({
        where: { templateVersionId: 'v-id' },
        order: { channel: 'ASC' },
      });
    });

    it('should return empty array when none found', async () => {
      mockTypeOrmRepo.find.mockResolvedValue([]);

      const result = await repository.findByVersionId('nonexistent');

      expect(result).toEqual([]);
    });
  });
});
