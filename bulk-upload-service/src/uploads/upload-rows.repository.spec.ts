import { Repository } from 'typeorm';
import { UploadRowsRepository } from './upload-rows.repository.js';
import { UploadRow, UploadRowStatus } from './entities/upload-row.entity.js';

describe('UploadRowsRepository', () => {
  let repository: UploadRowsRepository;
  let mockTypeOrmRepo: jest.Mocked<Repository<UploadRow>>;
  let mockQueryBuilder: any;

  const mockRow: UploadRow = {
    id: 'row-uuid',
    uploadId: 'upload-uuid',
    upload: {} as any,
    rowNumber: 1,
    groupKey: null,
    rawData: { eventType: 'order.created', email: 'test@example.com' },
    mappedPayload: null,
    eventId: null,
    status: UploadRowStatus.PENDING,
    errorMessage: null,
    processedAt: null,
  };

  beforeEach(() => {
    mockQueryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [] }),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    mockTypeOrmRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    } as any;

    repository = new UploadRowsRepository(mockTypeOrmRepo);
  });

  describe('bulkInsert', () => {
    it('should insert rows in bulk', async () => {
      await repository.bulkInsert([
        { uploadId: 'upload-uuid', rowNumber: 1, rawData: {} },
        { uploadId: 'upload-uuid', rowNumber: 2, rawData: {} },
      ]);

      expect(mockQueryBuilder.insert).toHaveBeenCalled();
      expect(mockQueryBuilder.values).toHaveBeenCalled();
      expect(mockQueryBuilder.execute).toHaveBeenCalled();
    });

    it('should do nothing for empty array', async () => {
      await repository.bulkInsert([]);
      expect(mockQueryBuilder.insert).not.toHaveBeenCalled();
    });
  });

  describe('findByUploadId', () => {
    it('should return paginated rows for upload', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[mockRow], 1]);

      const result = await repository.findByUploadId('upload-uuid');

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should use custom pagination', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findByUploadId('upload-uuid', 2, 25);

      expect(mockTypeOrmRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 25,
          take: 25,
        }),
      );
    });
  });

  describe('findFailedByUploadId', () => {
    it('should return failed and skipped rows', async () => {
      const failedRow = {
        ...mockRow,
        status: UploadRowStatus.FAILED,
        errorMessage: 'No mapping found',
      };
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[failedRow], 1]);

      const result = await repository.findFailedByUploadId('upload-uuid');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe(UploadRowStatus.FAILED);
    });

    it('should use default pagination', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await repository.findFailedByUploadId('upload-uuid');

      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });
  });

  describe('updateRowStatus', () => {
    it('should update status with error message', async () => {
      mockTypeOrmRepo.update.mockResolvedValue({ affected: 1 } as any);

      await repository.updateRowStatus(
        'row-uuid',
        UploadRowStatus.FAILED,
        'Validation error',
      );

      expect(mockTypeOrmRepo.update).toHaveBeenCalledWith(
        'row-uuid',
        expect.objectContaining({
          status: UploadRowStatus.FAILED,
          errorMessage: 'Validation error',
        }),
      );
    });

    it('should update status with event id', async () => {
      mockTypeOrmRepo.update.mockResolvedValue({ affected: 1 } as any);

      await repository.updateRowStatus(
        'row-uuid',
        UploadRowStatus.SUCCEEDED,
        undefined,
        'event-uuid',
      );

      expect(mockTypeOrmRepo.update).toHaveBeenCalledWith(
        'row-uuid',
        expect.objectContaining({
          status: UploadRowStatus.SUCCEEDED,
          eventId: 'event-uuid',
        }),
      );
    });

    it('should always set processedAt', async () => {
      mockTypeOrmRepo.update.mockResolvedValue({ affected: 1 } as any);

      await repository.updateRowStatus('row-uuid', UploadRowStatus.SUCCEEDED);

      expect(mockTypeOrmRepo.update).toHaveBeenCalledWith(
        'row-uuid',
        expect.objectContaining({
          processedAt: expect.any(Date),
        }),
      );
    });
  });

  describe('countByStatus', () => {
    it('should return counts grouped by status', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { status: 'succeeded', count: 8 },
        { status: 'failed', count: 2 },
      ]);

      const result = await repository.countByStatus('upload-uuid');

      expect(result.succeeded).toBe(8);
      expect(result.failed).toBe(2);
    });

    it('should return empty object for no rows', async () => {
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await repository.countByStatus('upload-uuid');

      expect(Object.keys(result)).toHaveLength(0);
    });
  });

  describe('deleteByUploadId', () => {
    it('should delete all rows for upload', async () => {
      mockTypeOrmRepo.delete.mockResolvedValue({ affected: 10 } as any);

      await repository.deleteByUploadId('upload-uuid');

      expect(mockTypeOrmRepo.delete).toHaveBeenCalledWith({
        uploadId: 'upload-uuid',
      });
    });
  });
});
