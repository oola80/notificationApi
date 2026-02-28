import { Repository } from 'typeorm';
import { UploadsRepository } from './uploads.repository.js';
import { Upload, UploadStatus } from './entities/upload.entity.js';

describe('UploadsRepository', () => {
  let repository: UploadsRepository;
  let mockTypeOrmRepo: jest.Mocked<Repository<Upload>>;
  let mockQueryBuilder: any;

  const mockUpload: Upload = {
    id: 'test-uuid',
    fileName: 'test.xlsx',
    fileSize: 1024,
    totalRows: 10,
    totalEvents: null,
    processedRows: 0,
    succeededRows: 0,
    failedRows: 0,
    status: UploadStatus.QUEUED,
    uploadedBy: '00000000-0000-0000-0000-000000000000',
    originalFilePath: '/uploads/temp/test-uuid/original.xlsx',
    resultFilePath: null,
    resultGeneratedAt: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ raw: [] }),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    mockTypeOrmRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    } as any;

    repository = new UploadsRepository(mockTypeOrmRepo);
  });

  describe('findById', () => {
    it('should return upload when found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(mockUpload);
      const result = await repository.findById('test-uuid');
      expect(result).toEqual(mockUpload);
    });

    it('should return null when not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);
      const result = await repository.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('findWithFilters', () => {
    it('should query with status filter', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[mockUpload], 1]);

      const result = await repository.findWithFilters({
        status: UploadStatus.QUEUED,
        page: 1,
        limit: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should query with pagination', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await repository.findWithFilters({
        page: 2,
        limit: 10,
      });

      expect(mockTypeOrmRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should use default pagination', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[mockUpload], 1]);

      const result = await repository.findWithFilters({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should handle date range with query builder', async () => {
      mockQueryBuilder.getManyAndCount.mockResolvedValue([[mockUpload], 1]);

      const result = await repository.findWithFilters({
        dateFrom: new Date('2026-01-01'),
        dateTo: new Date('2026-12-31'),
        page: 1,
        limit: 20,
      });

      expect(mockTypeOrmRepo.createQueryBuilder).toHaveBeenCalledWith('upload');
      expect(result.data).toHaveLength(1);
    });

    it('should sort descending by createdAt by default', async () => {
      mockTypeOrmRepo.findAndCount.mockResolvedValue([[], 0]);

      await repository.findWithFilters({});

      expect(mockTypeOrmRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { createdAt: 'DESC' },
        }),
      );
    });
  });

  describe('claimNextQueued', () => {
    it('should return upload when one is claimed', async () => {
      mockQueryBuilder.execute.mockResolvedValue({
        raw: [mockUpload],
      });
      mockTypeOrmRepo.create.mockReturnValue(mockUpload);

      const result = await repository.claimNextQueued();
      expect(result).toEqual(mockUpload);
    });

    it('should return null when no queued uploads', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ raw: [] });

      const result = await repository.claimNextQueued();
      expect(result).toBeNull();
    });
  });

  describe('updateCounters', () => {
    it('should increment counters atomically', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 1 });

      await repository.updateCounters('test-uuid', 5, 2);

      expect(mockQueryBuilder.set).toHaveBeenCalled();
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('id = :id', {
        id: 'test-uuid',
      });
    });
  });

  describe('updateStatus', () => {
    it('should update status for valid transition', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.QUEUED,
      });
      mockTypeOrmRepo.save.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.PROCESSING,
      });

      const result = await repository.updateStatus(
        'test-uuid',
        UploadStatus.PROCESSING,
      );

      expect(result).toBeDefined();
      expect(result!.status).toBe(UploadStatus.PROCESSING);
    });

    it('should return null for invalid transition', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.COMPLETED,
      });

      const result = await repository.updateStatus(
        'test-uuid',
        UploadStatus.QUEUED,
      );

      expect(result).toBeNull();
    });

    it('should return null when upload not found', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue(null);

      const result = await repository.updateStatus(
        'missing',
        UploadStatus.PROCESSING,
      );

      expect(result).toBeNull();
    });

    it('should set completedAt for terminal statuses', async () => {
      mockTypeOrmRepo.findOne.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.PROCESSING,
      });
      mockTypeOrmRepo.save.mockImplementation(async (entity) => entity as any);

      const result = await repository.updateStatus(
        'test-uuid',
        UploadStatus.COMPLETED,
      );

      expect(result!.completedAt).toBeDefined();
    });
  });

  describe('isValidTransition', () => {
    it('should allow queued → processing', () => {
      expect(
        repository.isValidTransition(
          UploadStatus.QUEUED,
          UploadStatus.PROCESSING,
        ),
      ).toBe(true);
    });

    it('should allow queued → cancelled', () => {
      expect(
        repository.isValidTransition(
          UploadStatus.QUEUED,
          UploadStatus.CANCELLED,
        ),
      ).toBe(true);
    });

    it('should allow processing → completed', () => {
      expect(
        repository.isValidTransition(
          UploadStatus.PROCESSING,
          UploadStatus.COMPLETED,
        ),
      ).toBe(true);
    });

    it('should allow processing → partial', () => {
      expect(
        repository.isValidTransition(
          UploadStatus.PROCESSING,
          UploadStatus.PARTIAL,
        ),
      ).toBe(true);
    });

    it('should allow processing → failed', () => {
      expect(
        repository.isValidTransition(
          UploadStatus.PROCESSING,
          UploadStatus.FAILED,
        ),
      ).toBe(true);
    });

    it('should allow processing → cancelled', () => {
      expect(
        repository.isValidTransition(
          UploadStatus.PROCESSING,
          UploadStatus.CANCELLED,
        ),
      ).toBe(true);
    });

    it('should allow partial → processing (retry)', () => {
      expect(
        repository.isValidTransition(
          UploadStatus.PARTIAL,
          UploadStatus.PROCESSING,
        ),
      ).toBe(true);
    });

    it('should allow failed → processing (retry)', () => {
      expect(
        repository.isValidTransition(
          UploadStatus.FAILED,
          UploadStatus.PROCESSING,
        ),
      ).toBe(true);
    });

    it('should not allow completed → anything', () => {
      expect(
        repository.isValidTransition(
          UploadStatus.COMPLETED,
          UploadStatus.PROCESSING,
        ),
      ).toBe(false);
      expect(
        repository.isValidTransition(
          UploadStatus.COMPLETED,
          UploadStatus.QUEUED,
        ),
      ).toBe(false);
    });

    it('should not allow cancelled → anything', () => {
      expect(
        repository.isValidTransition(
          UploadStatus.CANCELLED,
          UploadStatus.PROCESSING,
        ),
      ).toBe(false);
    });

    it('should not allow queued → completed', () => {
      expect(
        repository.isValidTransition(
          UploadStatus.QUEUED,
          UploadStatus.COMPLETED,
        ),
      ).toBe(false);
    });
  });

  describe('create', () => {
    it('should create and save an upload', async () => {
      mockTypeOrmRepo.create.mockReturnValue(mockUpload);
      mockTypeOrmRepo.save.mockResolvedValue(mockUpload);

      const result = await repository.create({
        fileName: 'test.xlsx',
        fileSize: 1024,
        totalRows: 10,
        uploadedBy: 'user-uuid',
      });

      expect(result).toEqual(mockUpload);
    });
  });

  describe('delete', () => {
    it('should delete by id', async () => {
      mockTypeOrmRepo.delete.mockResolvedValue({ affected: 1 } as any);
      await repository.delete('test-uuid');
      expect(mockTypeOrmRepo.delete).toHaveBeenCalledWith('test-uuid');
    });
  });
});
