import { DlqService } from './dlq.service';
import { DlqEntryStatus } from './entities/dlq-entry.entity';

describe('DlqService', () => {
  let service: DlqService;
  let mockDlqRepo: any;
  let mockPublisher: any;
  let mockMetrics: any;

  beforeEach(() => {
    mockDlqRepo = {
      findById: jest.fn(),
      findWithFilters: jest.fn(),
      statusCounts: jest.fn(),
      updateEntry: jest.fn(),
      countPending: jest.fn().mockResolvedValue(0),
    };
    mockPublisher = {
      republish: jest.fn().mockResolvedValue(undefined),
    };
    mockMetrics = {
      setDlqPendingCount: jest.fn(),
    };
    service = new DlqService(mockDlqRepo, mockPublisher, mockMetrics);
  });

  describe('findAll', () => {
    it('should return paginated results with statusCounts', async () => {
      mockDlqRepo.findWithFilters.mockResolvedValue({
        data: [{ id: 'd-1' }],
        total: 1,
        page: 1,
        limit: 50,
      });
      mockDlqRepo.statusCounts.mockResolvedValue({
        pending: 3,
        investigated: 1,
        reprocessed: 0,
        discarded: 0,
      });

      const result = await service.findAll({});
      expect(result.data).toHaveLength(1);
      expect(result.meta.statusCounts.pending).toBe(3);
      expect(result.meta.totalCount).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should pass filters to repository', async () => {
      mockDlqRepo.findWithFilters.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 50,
      });
      mockDlqRepo.statusCounts.mockResolvedValue({
        pending: 0,
        investigated: 0,
        reprocessed: 0,
        discarded: 0,
      });

      await service.findAll({
        status: 'pending',
        originalQueue: 'audit.events',
        page: 2,
        pageSize: 25,
      });

      expect(mockDlqRepo.findWithFilters).toHaveBeenCalledWith({
        status: 'pending',
        originalQueue: 'audit.events',
        from: undefined,
        to: undefined,
        page: 2,
        limit: 25,
      });
    });
  });

  describe('updateStatus', () => {
    it('should transition from pending to investigated', async () => {
      mockDlqRepo.findById
        .mockResolvedValueOnce({ id: 'd-1', status: DlqEntryStatus.PENDING })
        .mockResolvedValueOnce({ id: 'd-1', status: DlqEntryStatus.INVESTIGATED });

      const result = await service.updateStatus('d-1', {
        status: 'investigated',
        notes: 'Looking into it',
      });

      expect(mockDlqRepo.updateEntry).toHaveBeenCalledWith(
        'd-1',
        expect.objectContaining({
          status: DlqEntryStatus.INVESTIGATED,
          notes: 'Looking into it',
        }),
      );
      expect(result.data.status).toBe(DlqEntryStatus.INVESTIGATED);
    });

    it('should transition from investigated to reprocessed with resolvedAt', async () => {
      mockDlqRepo.findById
        .mockResolvedValueOnce({ id: 'd-1', status: DlqEntryStatus.INVESTIGATED })
        .mockResolvedValueOnce({ id: 'd-1', status: DlqEntryStatus.REPROCESSED });

      await service.updateStatus('d-1', {
        status: 'reprocessed',
        resolvedBy: 'admin@test.com',
      });

      expect(mockDlqRepo.updateEntry).toHaveBeenCalledWith(
        'd-1',
        expect.objectContaining({
          status: DlqEntryStatus.REPROCESSED,
          resolvedBy: 'admin@test.com',
          resolvedAt: expect.any(Date),
        }),
      );
    });

    it('should transition from investigated to discarded with resolvedAt', async () => {
      mockDlqRepo.findById
        .mockResolvedValueOnce({ id: 'd-1', status: DlqEntryStatus.INVESTIGATED })
        .mockResolvedValueOnce({ id: 'd-1', status: DlqEntryStatus.DISCARDED });

      await service.updateStatus('d-1', { status: 'discarded' });

      expect(mockDlqRepo.updateEntry).toHaveBeenCalledWith(
        'd-1',
        expect.objectContaining({
          status: DlqEntryStatus.DISCARDED,
          resolvedAt: expect.any(Date),
          resolvedBy: 'system',
        }),
      );
    });

    it('should transition from pending to discarded', async () => {
      mockDlqRepo.findById
        .mockResolvedValueOnce({ id: 'd-1', status: DlqEntryStatus.PENDING })
        .mockResolvedValueOnce({ id: 'd-1', status: DlqEntryStatus.DISCARDED });

      await service.updateStatus('d-1', { status: 'discarded' });
      expect(mockDlqRepo.updateEntry).toHaveBeenCalled();
    });

    it('should reject invalid transition from pending to reprocessed', async () => {
      mockDlqRepo.findById.mockResolvedValue({
        id: 'd-1',
        status: DlqEntryStatus.PENDING,
      });

      await expect(
        service.updateStatus('d-1', { status: 'reprocessed' }),
      ).rejects.toThrow();
    });

    it('should reject transition from reprocessed (terminal)', async () => {
      mockDlqRepo.findById.mockResolvedValue({
        id: 'd-1',
        status: DlqEntryStatus.REPROCESSED,
      });

      await expect(
        service.updateStatus('d-1', { status: 'investigated' }),
      ).rejects.toThrow();
    });

    it('should reject transition from discarded (terminal)', async () => {
      mockDlqRepo.findById.mockResolvedValue({
        id: 'd-1',
        status: DlqEntryStatus.DISCARDED,
      });

      await expect(
        service.updateStatus('d-1', { status: 'investigated' }),
      ).rejects.toThrow();
    });

    it('should throw AUD-003 when entry not found', async () => {
      mockDlqRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus('nonexistent', { status: 'investigated' }),
      ).rejects.toThrow();
    });

    it('should update DLQ pending gauge after status change', async () => {
      mockDlqRepo.findById
        .mockResolvedValueOnce({ id: 'd-1', status: DlqEntryStatus.PENDING })
        .mockResolvedValueOnce({ id: 'd-1', status: DlqEntryStatus.INVESTIGATED });
      mockDlqRepo.countPending.mockResolvedValue(2);

      await service.updateStatus('d-1', { status: 'investigated' });
      expect(mockMetrics.setDlqPendingCount).toHaveBeenCalledWith(2);
    });
  });

  describe('reprocess', () => {
    const investigatedEntry = {
      id: 'd-1',
      status: DlqEntryStatus.INVESTIGATED,
      originalExchange: 'xch.events.normalized',
      originalRoutingKey: 'event.normalized',
      payload: { test: 'data' },
    };

    it('should republish to original exchange and mark reprocessed', async () => {
      mockDlqRepo.findById.mockResolvedValue(investigatedEntry);

      const result = await service.reprocess('d-1', 'admin@test.com');

      expect(mockPublisher.republish).toHaveBeenCalledWith(
        'xch.events.normalized',
        'event.normalized',
        { test: 'data' },
      );
      expect(mockDlqRepo.updateEntry).toHaveBeenCalledWith(
        'd-1',
        expect.objectContaining({
          status: DlqEntryStatus.REPROCESSED,
          resolvedBy: 'admin@test.com',
          resolvedAt: expect.any(Date),
        }),
      );
      expect(result.data.status).toBe(DlqEntryStatus.REPROCESSED);
      expect(result.data.reprocessedTo.exchange).toBe('xch.events.normalized');
    });

    it('should throw AUD-003 when entry not found', async () => {
      mockDlqRepo.findById.mockResolvedValue(null);
      await expect(service.reprocess('nonexistent')).rejects.toThrow();
    });

    it('should throw AUD-006 when not in investigated status', async () => {
      mockDlqRepo.findById.mockResolvedValue({
        ...investigatedEntry,
        status: DlqEntryStatus.PENDING,
      });
      await expect(service.reprocess('d-1')).rejects.toThrow();
    });

    it('should handle null routing key', async () => {
      mockDlqRepo.findById.mockResolvedValue({
        ...investigatedEntry,
        originalRoutingKey: null,
      });

      await service.reprocess('d-1');

      expect(mockPublisher.republish).toHaveBeenCalledWith(
        'xch.events.normalized',
        '',
        { test: 'data' },
      );
    });

    it('should default resolvedBy to system', async () => {
      mockDlqRepo.findById.mockResolvedValue(investigatedEntry);

      await service.reprocess('d-1');

      expect(mockDlqRepo.updateEntry).toHaveBeenCalledWith(
        'd-1',
        expect.objectContaining({ resolvedBy: 'system' }),
      );
    });

    it('should update DLQ pending gauge after reprocess', async () => {
      mockDlqRepo.findById.mockResolvedValue(investigatedEntry);
      mockDlqRepo.countPending.mockResolvedValue(1);

      await service.reprocess('d-1');
      expect(mockMetrics.setDlqPendingCount).toHaveBeenCalledWith(1);
    });
  });
});
