import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CustomerPreferencesController } from './customer-preferences.controller.js';
import { CustomerPreferencesService } from './customer-preferences.service.js';

const mockPreference = {
  id: 1,
  customerId: 'C001',
  channel: 'email',
  isOptedIn: true,
  sourceSystem: 'crm',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CustomerPreferencesController', () => {
  let controller: CustomerPreferencesController;
  let service: CustomerPreferencesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomerPreferencesController],
      providers: [
        {
          provide: CustomerPreferencesService,
          useValue: {
            upsert: jest.fn().mockResolvedValue(mockPreference),
            bulkUpsert: jest.fn().mockResolvedValue({ processed: 2 }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-api-key'),
          },
        },
      ],
    }).compile();

    controller = module.get<CustomerPreferencesController>(
      CustomerPreferencesController,
    );
    service = module.get<CustomerPreferencesService>(
      CustomerPreferencesService,
    );
  });

  describe('upsert', () => {
    it('should delegate to service.upsert', async () => {
      const dto = { customerId: 'C001', channel: 'email', isOptedIn: true };
      const result = await controller.upsert(dto as any);
      expect(service.upsert).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockPreference);
    });
  });

  describe('bulkUpsert', () => {
    it('should delegate to service.bulkUpsert', async () => {
      const dto = {
        preferences: [
          { customerId: 'C001', channel: 'email', isOptedIn: true },
          { customerId: 'C002', channel: 'sms', isOptedIn: false },
        ],
      };
      const result = await controller.bulkUpsert(dto as any);
      expect(service.bulkUpsert).toHaveBeenCalledWith(dto);
      expect(result).toEqual({ processed: 2 });
    });
  });
});
