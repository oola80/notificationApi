import { Test, TestingModule } from '@nestjs/testing';
import { CriticalChannelOverridesController } from './critical-channel-overrides.controller.js';
import { CriticalChannelOverridesService } from './critical-channel-overrides.service.js';

const mockOverride = {
  id: 'ooo-ppp-qqq',
  eventType: 'order.created',
  channel: 'email',
  reason: 'Critical notification',
  isActive: true,
  createdBy: 'admin',
  updatedBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('CriticalChannelOverridesController', () => {
  let controller: CriticalChannelOverridesController;
  let service: CriticalChannelOverridesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CriticalChannelOverridesController],
      providers: [
        {
          provide: CriticalChannelOverridesService,
          useValue: {
            create: jest.fn().mockResolvedValue(mockOverride),
            findAll: jest.fn().mockResolvedValue({
              data: [mockOverride],
              total: 1,
              page: 1,
              limit: 50,
            }),
            findById: jest.fn().mockResolvedValue(mockOverride),
            update: jest.fn().mockResolvedValue(mockOverride),
            softDelete: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<CriticalChannelOverridesController>(
      CriticalChannelOverridesController,
    );
    service = module.get<CriticalChannelOverridesService>(
      CriticalChannelOverridesService,
    );
  });

  describe('create', () => {
    it('should delegate to service.create', async () => {
      const dto = { eventType: 'order.created', channel: 'email' };
      const result = await controller.create(dto as any);
      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toEqual(mockOverride);
    });
  });

  describe('findAll', () => {
    it('should delegate to service.findAll', async () => {
      const query = { page: 1, limit: 50 };
      const result = await controller.findAll(query as any);
      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result.data).toHaveLength(1);
    });

    it('should pass eventType and isActive filters', async () => {
      const query = {
        eventType: 'order.created',
        isActive: true,
        page: 1,
        limit: 50,
      };
      await controller.findAll(query as any);
      expect(service.findAll).toHaveBeenCalledWith(query);
    });
  });

  describe('findById', () => {
    it('should delegate to service.findById', async () => {
      const result = await controller.findById('ooo-ppp-qqq');
      expect(service.findById).toHaveBeenCalledWith('ooo-ppp-qqq');
      expect(result).toEqual(mockOverride);
    });
  });

  describe('update', () => {
    it('should delegate to service.update with id and dto', async () => {
      const dto = { reason: 'Updated reason' };
      const result = await controller.update('ooo-ppp-qqq', dto as any);
      expect(service.update).toHaveBeenCalledWith('ooo-ppp-qqq', dto);
      expect(result).toEqual(mockOverride);
    });
  });

  describe('remove', () => {
    it('should delegate to service.softDelete', async () => {
      await controller.remove('ooo-ppp-qqq');
      expect(service.softDelete).toHaveBeenCalledWith('ooo-ppp-qqq');
    });
  });
});
