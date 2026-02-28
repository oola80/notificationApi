import { SearchService } from './search.service';
import { AuditEventsRepository } from '../events/audit-events.repository';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../metrics/metrics.service';
import { HttpException } from '@nestjs/common';

describe('SearchService', () => {
  let service: SearchService;
  let mockRepository: any;
  let mockConfigService: any;
  let mockMetricsService: any;

  beforeEach(() => {
    mockRepository = {
      fullTextSearch: jest.fn().mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 50,
      }),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue(200),
    };

    mockMetricsService = {
      observeSearchDuration: jest.fn(),
    };

    service = new SearchService(
      mockRepository as unknown as AuditEventsRepository,
      mockConfigService as unknown as ConfigService,
      mockMetricsService as unknown as MetricsService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('search', () => {
    it('should use plainto_tsquery for plain queries', async () => {
      await service.search({ q: 'order delay' });

      expect(mockRepository.fullTextSearch).toHaveBeenCalledWith(
        expect.objectContaining({ useRawTsquery: false }),
      );
    });

    it('should use to_tsquery when query contains &', async () => {
      await service.search({ q: 'order & delay' });

      expect(mockRepository.fullTextSearch).toHaveBeenCalledWith(
        expect.objectContaining({ useRawTsquery: true }),
      );
    });

    it('should use to_tsquery when query contains |', async () => {
      await service.search({ q: 'order | delay' });

      expect(mockRepository.fullTextSearch).toHaveBeenCalledWith(
        expect.objectContaining({ useRawTsquery: true }),
      );
    });

    it('should use to_tsquery when query contains !', async () => {
      await service.search({ q: '!spam' });

      expect(mockRepository.fullTextSearch).toHaveBeenCalledWith(
        expect.objectContaining({ useRawTsquery: true }),
      );
    });

    it('should use to_tsquery when query contains parentheses', async () => {
      await service.search({ q: '(order | delay) & email' });

      expect(mockRepository.fullTextSearch).toHaveBeenCalledWith(
        expect.objectContaining({ useRawTsquery: true }),
      );
    });

    it('should throw AUD-007 when results exceed searchMaxResults', async () => {
      mockRepository.fullTextSearch.mockResolvedValue({
        data: [],
        total: 201,
        page: 1,
        limit: 50,
      });

      await expect(service.search({ q: 'test' })).rejects.toThrow(
        HttpException,
      );

      try {
        await service.search({ q: 'test' });
      } catch (e: any) {
        expect(e.getResponse().code).toBe('AUD-007');
      }
    });

    it('should allow results at exactly searchMaxResults', async () => {
      mockRepository.fullTextSearch.mockResolvedValue({
        data: [],
        total: 200,
        page: 1,
        limit: 50,
      });

      await expect(service.search({ q: 'test' })).resolves.toBeDefined();
    });

    it('should observe search duration metric', async () => {
      await service.search({ q: 'test' });

      expect(mockMetricsService.observeSearchDuration).toHaveBeenCalledWith(
        expect.any(Number),
      );
    });

    it('should transform response to { data, meta } shape', async () => {
      mockRepository.fullTextSearch.mockResolvedValue({
        data: [{ id: '1' }],
        total: 100,
        page: 1,
        limit: 50,
      });

      const result = await service.search({ q: 'test' });

      expect(result.meta).toEqual({
        page: 1,
        pageSize: 50,
        totalCount: 100,
        totalPages: 2,
      });
    });

    it('should pass date range to repository', async () => {
      await service.search({
        q: 'test',
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-15T00:00:00Z',
      });

      expect(mockRepository.fullTextSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '2026-01-01T00:00:00Z',
          to: '2026-01-15T00:00:00Z',
        }),
      );
    });

    it('should pass pagination to repository', async () => {
      await service.search({ q: 'test', page: 3, pageSize: 20 });

      expect(mockRepository.fullTextSearch).toHaveBeenCalledWith(
        expect.objectContaining({ page: 3, limit: 20 }),
      );
    });
  });

  describe('date range validation', () => {
    it('should throw AUD-004 when date range exceeds 90 days', async () => {
      try {
        await service.search({
          q: 'test',
          from: '2026-01-01T00:00:00Z',
          to: '2026-05-01T00:00:00Z',
        });
        fail('Should have thrown');
      } catch (e: any) {
        expect(e.getResponse().code).toBe('AUD-004');
      }
    });

    it('should allow one-sided date range', async () => {
      await expect(
        service.search({ q: 'test', from: '2026-01-01T00:00:00Z' }),
      ).resolves.toBeDefined();
    });
  });
});
