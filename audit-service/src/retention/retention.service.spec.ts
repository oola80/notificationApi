import { RetentionService } from './retention.service';

describe('RetentionService', () => {
  let service: RetentionService;
  let mockDataSource: any;
  let mockConfigService: any;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
    };
    mockConfigService = {
      get: jest.fn().mockReturnValue(90),
    };
    service = new RetentionService(mockDataSource, mockConfigService);
  });

  describe('purgePayloads', () => {
    it('should call purge_audit_payloads with configured retention days', async () => {
      mockDataSource.query.mockResolvedValue([
        {
          result: {
            auditEventsPurged: 50,
            deliveryReceiptsPurged: 20,
          },
        },
      ]);

      const result = await service.purgePayloads();

      expect(mockDataSource.query).toHaveBeenCalledWith(
        'SELECT purge_audit_payloads($1) as result',
        [90],
      );
      expect(result.auditEventsPurged).toBe(50);
      expect(result.deliveryReceiptsPurged).toBe(20);
    });

    it('should use configured retention days', async () => {
      mockConfigService.get.mockReturnValue(30);
      mockDataSource.query.mockResolvedValue([
        { result: { auditEventsPurged: 0, deliveryReceiptsPurged: 0 } },
      ]);

      await service.purgePayloads();

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        [30],
      );
    });

    it('should handle null result gracefully', async () => {
      mockDataSource.query.mockResolvedValue([{ result: null }]);

      const result = await service.purgePayloads();
      expect(result.auditEventsPurged).toBe(0);
      expect(result.deliveryReceiptsPurged).toBe(0);
    });

    it('should handle empty result set', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.purgePayloads();
      expect(result.auditEventsPurged).toBe(0);
      expect(result.deliveryReceiptsPurged).toBe(0);
    });

    it('should propagate errors', async () => {
      mockDataSource.query.mockRejectedValue(new Error('DB error'));
      await expect(service.purgePayloads()).rejects.toThrow('DB error');
    });

    it('should default to 90 days when config not set', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      mockDataSource.query.mockResolvedValue([
        { result: { auditEventsPurged: 0, deliveryReceiptsPurged: 0 } },
      ]);

      await service.purgePayloads();

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.any(String),
        [90],
      );
    });
  });

  describe('cleanupDlqEntries', () => {
    it('should delete terminal DLQ entries older than 90 days', async () => {
      mockDataSource.query.mockResolvedValue([[], 15]);

      const result = await service.cleanupDlqEntries();

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("status IN ('reprocessed', 'discarded')"),
        [90],
      );
      expect(result).toBe(15);
    });

    it('should not delete pending or investigated entries', async () => {
      mockDataSource.query.mockResolvedValue([[], 0]);

      await service.cleanupDlqEntries();

      const sql = mockDataSource.query.mock.calls[0][0];
      expect(sql).not.toContain('pending');
      expect(sql).not.toContain('investigated');
      expect(sql).toContain('reprocessed');
      expect(sql).toContain('discarded');
    });

    it('should handle zero deletions', async () => {
      mockDataSource.query.mockResolvedValue([[], 0]);

      const result = await service.cleanupDlqEntries();
      expect(result).toBe(0);
    });

    it('should propagate errors', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Connection lost'));
      await expect(service.cleanupDlqEntries()).rejects.toThrow(
        'Connection lost',
      );
    });
  });
});
