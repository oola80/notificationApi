import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventSourcesRepository } from './event-sources.repository.js';
import { EventSource } from './entities/event-source.entity.js';

describe('EventSourcesRepository', () => {
  let repository: EventSourcesRepository;
  let mockTypeOrmRepo: any;

  const mockSource: EventSource = {
    id: 1,
    name: 'shopify',
    displayName: 'Shopify',
    type: 'webhook',
    connectionConfig: null,
    apiKeyHash: 'abc123hash',
    signingSecretHash: null,
    isActive: true,
    rateLimit: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockTypeOrmRepo = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventSourcesRepository,
        {
          provide: getRepositoryToken(EventSource),
          useValue: mockTypeOrmRepo,
        },
      ],
    }).compile();

    repository = module.get<EventSourcesRepository>(EventSourcesRepository);
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findByName', () => {
    it('should find a source by name', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(mockSource);

      const result = await repository.findByName('shopify');
      expect(result).toEqual(mockSource);
      expect(mockTypeOrmRepo.findOne).toHaveBeenCalledWith({
        where: { name: 'shopify' },
      });
    });

    it('should return null when source not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);

      const result = await repository.findByName('unknown');
      expect(result).toBeNull();
    });
  });
});
