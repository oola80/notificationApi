import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProviderConfigsRepository } from './provider-configs.repository.js';
import { ProviderConfig } from './entities/provider-config.entity.js';

describe('ProviderConfigsRepository', () => {
  let repository: ProviderConfigsRepository;
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
        ProviderConfigsRepository,
        { provide: getRepositoryToken(ProviderConfig), useValue: mockRepo },
      ],
    }).compile();

    repository = module.get<ProviderConfigsRepository>(
      ProviderConfigsRepository,
    );
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  describe('findById', () => {
    it('should return a provider by id', async () => {
      const provider = { id: 'uuid-1', providerName: 'SendGrid' };
      mockRepo.findOne.mockResolvedValue(provider);

      const result = await repository.findById('uuid-1');
      expect(result).toEqual(provider);
    });

    it('should return null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      const result = await repository.findById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findActiveByChannel', () => {
    it('should return active providers for a channel', async () => {
      const providers = [
        { id: 'p1', channel: 'email', isActive: true, routingWeight: 100 },
        { id: 'p2', channel: 'email', isActive: true, routingWeight: 50 },
      ];
      mockRepo.find.mockResolvedValue(providers);

      const result = await repository.findActiveByChannel('email');
      expect(result).toEqual(providers);
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { channel: 'email', isActive: true },
        order: { routingWeight: 'DESC' },
      });
    });
  });

  describe('findByAdapterUrl', () => {
    it('should return a provider by adapter URL', async () => {
      const provider = {
        id: 'p1',
        adapterUrl: 'http://provider-adapter-sendgrid:3170',
      };
      mockRepo.findOne.mockResolvedValue(provider);

      const result = await repository.findByAdapterUrl(
        'http://provider-adapter-sendgrid:3170',
      );
      expect(result).toEqual(provider);
    });
  });

  describe('save', () => {
    it('should save a provider entity', async () => {
      const provider = { id: 'p1' } as ProviderConfig;
      mockRepo.save.mockResolvedValue(provider);

      const result = await repository.save(provider);
      expect(result).toEqual(provider);
    });
  });

  describe('create', () => {
    it('should create and save a new provider', async () => {
      const data = {
        providerName: 'SendGrid',
        providerId: 'sendgrid',
        channel: 'email',
        adapterUrl: 'http://provider-adapter-sendgrid:3170',
      };
      const entity = { ...data, id: 'p-new' };
      mockRepo.create.mockReturnValue(entity);
      mockRepo.save.mockResolvedValue(entity);

      const result = await repository.create(data);
      expect(result).toEqual(entity);
    });
  });
});
