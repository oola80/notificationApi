import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CustomerPreferencesRepository } from './customer-preferences.repository.js';
import { CustomerChannelPreference } from './entities/customer-channel-preference.entity.js';

const mockPreference = {
  id: 1,
  customerId: 'C001',
  channel: 'email',
  isOptedIn: true,
  sourceSystem: 'crm',
};

const mockQueryBuilder = {
  insert: jest.fn().mockReturnThis(),
  into: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  orUpdate: jest.fn().mockReturnThis(),
  execute: jest.fn().mockResolvedValue({ identifiers: [{ id: 1 }] }),
};

const mockManager = {
  createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
};

describe('CustomerPreferencesRepository', () => {
  let repository: CustomerPreferencesRepository;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      find: jest.fn().mockResolvedValue([mockPreference]),
      findOne: jest.fn().mockResolvedValue(mockPreference),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
      manager: {
        transaction: jest
          .fn()
          .mockImplementation(async (cb) => cb(mockManager)),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerPreferencesRepository,
        {
          provide: getRepositoryToken(CustomerChannelPreference),
          useValue: mockRepo,
        },
      ],
    }).compile();

    repository = module.get<CustomerPreferencesRepository>(
      CustomerPreferencesRepository,
    );
  });

  describe('findByCustomerId', () => {
    it('should find all preferences for a customer', async () => {
      const result = await repository.findByCustomerId('C001');
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { customerId: 'C001' },
      });
      expect(result).toEqual([mockPreference]);
    });
  });

  describe('upsertPreference', () => {
    it('should execute upsert query', async () => {
      const result = await repository.upsertPreference(
        'C001',
        'email',
        true,
        'crm',
      );
      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          customerId: 'C001',
          channel: 'email',
          isOptedIn: true,
        }),
      );
      expect(mockQueryBuilder.orUpdate).toHaveBeenCalledWith(
        ['is_opted_in', 'source_system', 'updated_at'],
        ['customer_id', 'channel'],
      );
      expect(result).toEqual(mockPreference);
    });

    it('should handle null sourceSystem', async () => {
      await repository.upsertPreference('C001', 'sms', false);
      expect(mockQueryBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({ sourceSystem: null }),
      );
    });
  });

  describe('bulkUpsert', () => {
    it('should execute in a transaction with batches', async () => {
      const records = [
        { customerId: 'C001', channel: 'email', isOptedIn: true },
        { customerId: 'C002', channel: 'sms', isOptedIn: false },
      ];
      await repository.bulkUpsert(records);
      expect(mockRepo.manager.transaction).toHaveBeenCalled();
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should batch records in groups of 100', async () => {
      mockQueryBuilder.execute.mockClear();
      const records = Array.from({ length: 250 }, (_, i) => ({
        customerId: `C${i}`,
        channel: 'email',
        isOptedIn: true,
      }));
      await repository.bulkUpsert(records);
      // 250 records / 100 batch size = 3 batches
      expect(mockQueryBuilder.execute).toHaveBeenCalledTimes(3);
    });
  });
});
