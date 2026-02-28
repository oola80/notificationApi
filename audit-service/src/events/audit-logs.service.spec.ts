import { AuditLogsService } from './audit-logs.service';
import { AuditEventsRepository } from './audit-events.repository';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';

describe('AuditLogsService', () => {
  let service: AuditLogsService;
  let mockRepository: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockRepository = {
      findWithFilters: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 50,
      }),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(200),
    };

    service = new AuditLogsService(
      mockRepository as unknown as AuditEventsRepository,
      mockConfigService as unknown as ConfigService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should delegate to repository with mapped filters', async () => {
      await service.findAll({
        notificationId: 'n-1',
        eventType: 'DELIVERY_SENT',
        page: 2,
        pageSize: 25,
      });

      expect(mockRepository.findWithFilters).toHaveBeenCalledWith({
        notificationId: 'n-1',
        correlationId: undefined,
        cycleId: undefined,
        eventType: 'DELIVERY_SENT',
        actor: undefined,
        from: undefined,
        to: undefined,
        q: undefined,
        page: 2,
        limit: 25,
      });
    });

    it('should transform response to { data, meta } shape', async () => {
      mockRepository.findWithFilters.mockResolvedValue({
        data: [{ id: '1' }, { id: '2' }],
        total: 100,
        page: 1,
        limit: 50,
      });

      const result = await service.findAll({ page: 1, pageSize: 50 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({
        page: 1,
        pageSize: 50,
        totalCount: 100,
        totalPages: 2,
      });
    });

    it('should calculate totalPages correctly with remainder', async () => {
      mockRepository.findWithFilters.mockResolvedValue({
        data: [],
        total: 51,
        page: 1,
        limit: 50,
      });

      const result = await service.findAll({ page: 1, pageSize: 50 });

      expect(result.meta.totalPages).toBe(2);
    });

    it('should return totalPages 0 when no results', async () => {
      const result = await service.findAll({ page: 1, pageSize: 50 });

      expect(result.meta.totalPages).toBe(0);
      expect(result.meta.totalCount).toBe(0);
    });

    it('should pass all filters to repository', async () => {
      await service.findAll({
        notificationId: 'n-1',
        correlationId: 'c-1',
        cycleId: 'cy-1',
        eventType: 'DELIVERY_SENT',
        actor: 'crs',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-15T00:00:00Z',
        q: 'order',
        page: 1,
        pageSize: 50,
      });

      const call = mockRepository.findWithFilters.mock.calls[0][0];
      expect(call.notificationId).toBe('n-1');
      expect(call.correlationId).toBe('c-1');
      expect(call.cycleId).toBe('cy-1');
      expect(call.eventType).toBe('DELIVERY_SENT');
      expect(call.actor).toBe('crs');
      expect(call.from).toBe('2026-01-01T00:00:00Z');
      expect(call.to).toBe('2026-01-15T00:00:00Z');
      expect(call.q).toBe('order');
    });

    it('should use default page and pageSize', async () => {
      await service.findAll({});

      const call = mockRepository.findWithFilters.mock.calls[0][0];
      expect(call.page).toBeUndefined();
      expect(call.limit).toBeUndefined();
    });
  });

  describe('date range validation', () => {
    it('should throw AUD-004 when date range exceeds 90 days', async () => {
      await expect(
        service.findAll({
          from: '2026-01-01T00:00:00Z',
          to: '2026-05-01T00:00:00Z',
        }),
      ).rejects.toThrow(HttpException);

      try {
        await service.findAll({
          from: '2026-01-01T00:00:00Z',
          to: '2026-05-01T00:00:00Z',
        });
      } catch (e: any) {
        expect(e.getResponse().code).toBe('AUD-004');
      }
    });

    it('should allow exactly 90 days', async () => {
      await expect(
        service.findAll({
          from: '2026-01-01T00:00:00Z',
          to: '2026-04-01T00:00:00Z',
        }),
      ).resolves.toBeDefined();
    });

    it('should allow one-sided from range', async () => {
      await expect(
        service.findAll({ from: '2026-01-01T00:00:00Z' }),
      ).resolves.toBeDefined();
    });

    it('should allow one-sided to range', async () => {
      await expect(
        service.findAll({ to: '2026-05-01T00:00:00Z' }),
      ).resolves.toBeDefined();
    });

    it('should allow no date range', async () => {
      await expect(service.findAll({})).resolves.toBeDefined();
    });

    it('should throw with message containing 90', async () => {
      try {
        await service.findAll({
          from: '2026-01-01T00:00:00Z',
          to: '2026-06-01T00:00:00Z',
        });
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.getResponse().message).toContain('90');
      }
    });
  });
});
