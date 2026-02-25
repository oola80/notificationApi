import { Test, TestingModule } from '@nestjs/testing';
import { CriticalChannelOverridesService } from './critical-channel-overrides.service.js';
import { CriticalChannelOverridesRepository } from './critical-channel-overrides.repository.js';
import { OverrideCacheService } from './override-cache.service.js';
import { NotificationPublisherService } from '../rabbitmq/notification-publisher.service.js';
import { HttpException } from '@nestjs/common';

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

describe('CriticalChannelOverridesService', () => {
  let service: CriticalChannelOverridesService;
  let repository: CriticalChannelOverridesRepository;
  let cache: OverrideCacheService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CriticalChannelOverridesService,
        {
          provide: CriticalChannelOverridesRepository,
          useValue: {
            existsActiveOverride: jest.fn().mockResolvedValue(false),
            create: jest.fn().mockResolvedValue(mockOverride),
            findById: jest.fn().mockResolvedValue(mockOverride),
            findWithPagination: jest.fn().mockResolvedValue({
              data: [mockOverride],
              total: 1,
              page: 1,
              limit: 50,
            }),
            save: jest.fn().mockResolvedValue(mockOverride),
          },
        },
        {
          provide: OverrideCacheService,
          useValue: {
            invalidate: jest.fn().mockResolvedValue(undefined),
            refresh: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationPublisherService,
          useValue: { publishConfigEvent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<CriticalChannelOverridesService>(
      CriticalChannelOverridesService,
    );
    repository = module.get<CriticalChannelOverridesRepository>(
      CriticalChannelOverridesRepository,
    );
    cache = module.get<OverrideCacheService>(OverrideCacheService);
  });

  describe('create', () => {
    it('should create override successfully', async () => {
      const dto = {
        eventType: 'order.created',
        channel: 'email',
        reason: 'Critical',
        createdBy: 'admin',
      };
      const result = await service.create(dto);
      expect(repository.existsActiveOverride).toHaveBeenCalledWith(
        'order.created',
        'email',
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'order.created',
          channel: 'email',
        }),
      );
      expect(cache.invalidate).toHaveBeenCalledWith('order.created');
      expect(result).toEqual(mockOverride);
    });

    it('should throw NES-011 on duplicate', async () => {
      jest.spyOn(repository, 'existsActiveOverride').mockResolvedValue(true);
      try {
        await service.create({ eventType: 'order.created', channel: 'email' });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getResponse()).toEqual(
          expect.objectContaining({ code: 'NES-011' }),
        );
      }
    });

    it('should set null for optional fields', async () => {
      const dto = { eventType: 'order.created', channel: 'email' };
      await service.create(dto);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: null, createdBy: null }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const result = await service.findAll({ page: 1, limit: 50 });
      expect(result.data).toHaveLength(1);
    });

    it('should pass eventType filter', async () => {
      await service.findAll({ eventType: 'order.created', page: 1, limit: 50 });
      expect(repository.findWithPagination).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ eventType: 'order.created' }),
        }),
      );
    });

    it('should pass isActive filter', async () => {
      await service.findAll({ isActive: true, page: 1, limit: 50 });
      expect(repository.findWithPagination).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return override', async () => {
      const result = await service.findById('ooo-ppp-qqq');
      expect(repository.findById).toHaveBeenCalledWith('ooo-ppp-qqq');
      expect(result).toEqual(mockOverride);
    });

    it('should throw NES-005 when not found', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(null);
      try {
        await service.findById('not-found');
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getResponse()).toEqual(
          expect.objectContaining({ code: 'NES-005' }),
        );
      }
    });
  });

  describe('update', () => {
    it('should update fields and invalidate cache', async () => {
      const dto = { reason: 'Updated reason', updatedBy: 'editor' };
      await service.update('ooo-ppp-qqq', dto);
      expect(repository.save).toHaveBeenCalled();
      expect(cache.invalidate).toHaveBeenCalledWith('order.created');
    });

    it('should only update provided fields', async () => {
      const override = { ...mockOverride, reason: 'Original' };
      jest.spyOn(repository, 'findById').mockResolvedValue(override as any);
      jest.spyOn(repository, 'save').mockResolvedValue(override as any);

      await service.update('ooo-ppp-qqq', { updatedBy: 'editor' });
      expect(override.reason).toBe('Original');
      expect(override.updatedBy).toBe('editor');
    });
  });

  describe('softDelete', () => {
    it('should set isActive to false and invalidate cache', async () => {
      const override = { ...mockOverride };
      jest.spyOn(repository, 'findById').mockResolvedValue(override as any);
      jest
        .spyOn(repository, 'save')
        .mockResolvedValue({ ...override, isActive: false } as any);

      await service.softDelete('ooo-ppp-qqq');
      expect(override.isActive).toBe(false);
      expect(repository.save).toHaveBeenCalled();
      expect(cache.invalidate).toHaveBeenCalledWith('order.created');
    });

    it('should throw NES-005 when not found', async () => {
      jest.spyOn(repository, 'findById').mockResolvedValue(null);
      try {
        await service.softDelete('not-found');
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getResponse()).toEqual(
          expect.objectContaining({ code: 'NES-005' }),
        );
      }
    });
  });
});
