import { ConfigService } from '@nestjs/config';
import { UploadsService } from './uploads.service.js';
import { UploadsRepository } from './uploads.repository.js';
import { UploadRowsRepository } from './upload-rows.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { Upload, UploadStatus } from './entities/upload.entity.js';
import { UploadRowStatus } from './entities/upload-row.entity.js';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('UploadsService', () => {
  let service: UploadsService;
  let uploadsRepository: jest.Mocked<UploadsRepository>;
  let uploadRowsRepository: jest.Mocked<UploadRowsRepository>;
  let configService: jest.Mocked<ConfigService>;
  let metricsService: jest.Mocked<MetricsService>;
  let tempDir: string;

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

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bus-test-'));
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    uploadsRepository = {
      findById: jest.fn(),
      findWithFilters: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      updateStatus: jest.fn(),
      updateCounters: jest.fn(),
      claimNextQueued: jest.fn(),
      findWithPagination: jest.fn(),
      isValidTransition: jest.fn(),
      save: jest.fn(),
    } as any;

    uploadRowsRepository = {
      bulkInsert: jest.fn(),
      findByUploadId: jest.fn(),
      findFailedByUploadId: jest.fn(),
      updateRowStatus: jest.fn(),
      countByStatus: jest.fn(),
      deleteByUploadId: jest.fn(),
      findById: jest.fn(),
      findWithPagination: jest.fn(),
      resetFailedRows: jest.fn(),
    } as any;

    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'app.uploadMaxFileSizeMb': 10,
          'app.uploadMaxRows': 5000,
          'app.uploadTempDir': tempDir,
          'app.groupKeyColumn': 'orderId',
          'app.groupItemsPrefix': 'item.',
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    metricsService = {
      incrementUploads: jest.fn(),
      incrementRows: jest.fn(),
      observeFileSize: jest.fn(),
      observeDuration: jest.fn(),
      setActiveUploads: jest.fn(),
      incrementRetry: jest.fn(),
    } as any;

    service = new UploadsService(
      uploadsRepository,
      uploadRowsRepository,
      configService,
      metricsService,
    );
  });

  async function createTestXlsx(
    headers: string[],
    rows: any[][],
  ): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(row);
    }
    const filePath = path.join(tempDir, `test-${Date.now()}.xlsx`);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  describe('processUpload', () => {
    it('should reject non-xlsx files', async () => {
      const file = {
        originalname: 'test.csv',
        mimetype: 'text/csv',
        size: 1024,
        path: path.join(tempDir, 'test.csv'),
      } as Express.Multer.File;
      fs.writeFileSync(file.path, 'test');

      await expect(
        service.processUpload(file, 'user-uuid'),
      ).rejects.toThrow();
    });

    it('should reject invalid MIME type', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'data'],
        [['order.created', 'test']],
      );
      const file = {
        originalname: 'test.xlsx',
        mimetype: 'application/octet-stream',
        size: 1024,
        path: filePath,
      } as Express.Multer.File;

      await expect(
        service.processUpload(file, 'user-uuid'),
      ).rejects.toThrow();
    });

    it('should reject files exceeding size limit', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'data'],
        [['order.created', 'test']],
      );
      const file = {
        originalname: 'test.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 11 * 1024 * 1024, // 11 MB
        path: filePath,
      } as Express.Multer.File;

      await expect(
        service.processUpload(file, 'user-uuid'),
      ).rejects.toThrow();
    });

    it('should reject files without eventType column', async () => {
      const filePath = await createTestXlsx(
        ['name', 'email'],
        [['John', 'john@example.com']],
      );
      const file = {
        originalname: 'test.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 1024,
        path: filePath,
      } as Express.Multer.File;

      await expect(
        service.processUpload(file, 'user-uuid'),
      ).rejects.toThrow();
    });

    it('should reject empty files (no data rows)', async () => {
      const filePath = await createTestXlsx(['eventType'], []);
      const file = {
        originalname: 'test.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 1024,
        path: filePath,
      } as Express.Multer.File;

      await expect(
        service.processUpload(file, 'user-uuid'),
      ).rejects.toThrow();
    });

    it('should reject files with item.* columns but no group key column', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'item.sku', 'item.qty'],
        [['order.created', 'SKU-1', 2]],
      );
      const file = {
        originalname: 'test.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 1024,
        path: filePath,
      } as Express.Multer.File;

      await expect(
        service.processUpload(file, 'user-uuid'),
      ).rejects.toThrow();
    });

    it('should accept valid files with item.* columns and group key column', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'orderId', 'item.sku', 'item.qty'],
        [['order.created', 'ORD-1', 'SKU-1', 2]],
      );
      const file = {
        originalname: 'test.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 1024,
        path: filePath,
      } as Express.Multer.File;

      uploadsRepository.create.mockResolvedValue({
        ...mockUpload,
        totalRows: 1,
      });

      const result = await service.processUpload(file, 'user-uuid');
      expect(result.totalRows).toBe(1);
      expect(uploadsRepository.create).toHaveBeenCalled();
    });

    it('should create upload record for valid file', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'email'],
        [
          ['order.created', 'test@example.com'],
          ['order.shipped', 'test2@example.com'],
        ],
      );
      const file = {
        originalname: 'orders.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 2048,
        path: filePath,
      } as Express.Multer.File;

      uploadsRepository.create.mockResolvedValue({
        ...mockUpload,
        fileName: 'orders.xlsx',
        fileSize: 2048,
        totalRows: 2,
      });

      const result = await service.processUpload(file, 'user-uuid');
      expect(result.totalRows).toBe(2);
      expect(result.fileName).toBe('orders.xlsx');
      expect(metricsService.incrementUploads).toHaveBeenCalledWith('queued');
      expect(metricsService.observeFileSize).toHaveBeenCalledWith(2048);
    });
  });

  describe('findAll', () => {
    it('should return paginated results', async () => {
      uploadsRepository.findWithFilters.mockResolvedValue({
        data: [mockUpload],
        total: 1,
        page: 1,
        limit: 20,
      });

      const result = await service.findAll({ page: 1, limit: 20 } as any);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('should pass filter options correctly', async () => {
      uploadsRepository.findWithFilters.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
      });

      await service.findAll({
        status: UploadStatus.COMPLETED,
        page: 2,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      } as any);

      expect(uploadsRepository.findWithFilters).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UploadStatus.COMPLETED,
          page: 2,
          limit: 10,
        }),
      );
    });
  });

  describe('findById', () => {
    it('should return upload when found', async () => {
      uploadsRepository.findById.mockResolvedValue(mockUpload);
      const result = await service.findById('test-uuid');
      expect(result.uploadId).toBe('test-uuid');
    });

    it('should throw BUS-002 when not found', async () => {
      uploadsRepository.findById.mockResolvedValue(null);
      await expect(service.findById('missing-uuid')).rejects.toThrow();
    });
  });

  describe('getStatus', () => {
    it('should return status with progress', async () => {
      const processing = {
        ...mockUpload,
        status: UploadStatus.PROCESSING,
        totalRows: 100,
        processedRows: 50,
        succeededRows: 48,
        failedRows: 2,
        startedAt: new Date(Date.now() - 10000),
      };
      uploadsRepository.findById.mockResolvedValue(processing);

      const result = await service.getStatus('test-uuid');
      expect(result.progressPercent).toBe(50);
      expect(result.estimatedTimeRemainingMs).toBeGreaterThan(0);
    });

    it('should return 0 progress for queued upload', async () => {
      uploadsRepository.findById.mockResolvedValue(mockUpload);
      const result = await service.getStatus('test-uuid');
      expect(result.progressPercent).toBe(0);
      expect(result.estimatedTimeRemainingMs).toBeNull();
    });

    it('should throw BUS-002 when not found', async () => {
      uploadsRepository.findById.mockResolvedValue(null);
      await expect(service.getStatus('missing')).rejects.toThrow();
    });
  });

  describe('getErrors', () => {
    it('should return failed rows', async () => {
      uploadsRepository.findById.mockResolvedValue(mockUpload);
      uploadRowsRepository.findFailedByUploadId.mockResolvedValue({
        data: [
          {
            id: 'row-1',
            uploadId: 'test-uuid',
            rowNumber: 5,
            groupKey: null,
            rawData: { eventType: 'order.unknown' },
            mappedPayload: null,
            eventId: null,
            status: UploadRowStatus.FAILED,
            errorMessage: 'No mapping found',
            processedAt: new Date(),
            upload: mockUpload,
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      });

      const result = await service.getErrors('test-uuid', {
        page: 1,
        limit: 50,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].rowNumber).toBe(5);
      expect(result.data[0].status).toBe('failed');
    });

    it('should throw BUS-002 when upload not found', async () => {
      uploadsRepository.findById.mockResolvedValue(null);
      await expect(
        service.getErrors('missing', { page: 1, limit: 50 }),
      ).rejects.toThrow();
    });
  });

  describe('cancelOrDelete', () => {
    it('should cancel queued upload', async () => {
      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.QUEUED,
      });
      uploadsRepository.updateStatus.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.CANCELLED,
      });

      await service.cancelOrDelete('test-uuid');
      expect(uploadsRepository.updateStatus).toHaveBeenCalledWith(
        'test-uuid',
        UploadStatus.CANCELLED,
      );
      expect(metricsService.incrementUploads).toHaveBeenCalledWith('cancelled');
    });

    it('should cancel processing upload', async () => {
      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.PROCESSING,
      });
      uploadsRepository.updateStatus.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.CANCELLED,
      });

      await service.cancelOrDelete('test-uuid');
      expect(uploadsRepository.updateStatus).toHaveBeenCalledWith(
        'test-uuid',
        UploadStatus.CANCELLED,
      );
    });

    it('should delete completed upload', async () => {
      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.COMPLETED,
      });

      await service.cancelOrDelete('test-uuid');
      expect(uploadsRepository.delete).toHaveBeenCalledWith('test-uuid');
    });

    it('should delete failed upload', async () => {
      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.FAILED,
      });

      await service.cancelOrDelete('test-uuid');
      expect(uploadsRepository.delete).toHaveBeenCalledWith('test-uuid');
    });

    it('should throw BUS-002 when not found', async () => {
      uploadsRepository.findById.mockResolvedValue(null);
      await expect(service.cancelOrDelete('missing')).rejects.toThrow();
    });

    it('should throw BUS-008 when transition fails', async () => {
      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.QUEUED,
      });
      uploadsRepository.updateStatus.mockResolvedValue(null);

      await expect(service.cancelOrDelete('test-uuid')).rejects.toThrow();
    });
  });

  describe('retryUpload', () => {
    it('should reset failed rows and requeue upload', async () => {
      const partialUpload = {
        ...mockUpload,
        status: UploadStatus.PARTIAL,
        processedRows: 10,
        succeededRows: 7,
        failedRows: 3,
        completedAt: new Date(),
        resultFilePath: '/path/to/result.xlsx',
        resultGeneratedAt: new Date(),
      };
      uploadsRepository.findById.mockResolvedValue(partialUpload);
      uploadRowsRepository.resetFailedRows.mockResolvedValue(3);
      uploadsRepository.save.mockResolvedValue({
        ...partialUpload,
        status: UploadStatus.QUEUED,
      });

      const result = await service.retryUpload('test-uuid');

      expect(result.uploadId).toBe('test-uuid');
      expect(result.status).toBe('queued');
      expect(result.retryableRows).toBe(3);
      expect(uploadRowsRepository.resetFailedRows).toHaveBeenCalledWith(
        'test-uuid',
      );
      expect(uploadsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UploadStatus.QUEUED,
          processedRows: 7,
          failedRows: 0,
          completedAt: null,
          resultFilePath: null,
          resultGeneratedAt: null,
        }),
      );
      expect(metricsService.incrementRetry).toHaveBeenCalled();
    });

    it('should allow retry on failed upload', async () => {
      const failedUpload = {
        ...mockUpload,
        status: UploadStatus.FAILED,
        processedRows: 5,
        succeededRows: 0,
        failedRows: 5,
      };
      uploadsRepository.findById.mockResolvedValue(failedUpload);
      uploadRowsRepository.resetFailedRows.mockResolvedValue(5);
      uploadsRepository.save.mockResolvedValue({
        ...failedUpload,
        status: UploadStatus.QUEUED,
      });

      const result = await service.retryUpload('test-uuid');

      expect(result.retryableRows).toBe(5);
      expect(result.status).toBe('queued');
    });

    it('should throw BUS-016 for queued upload', async () => {
      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.QUEUED,
      });

      await expect(service.retryUpload('test-uuid')).rejects.toThrow();
    });

    it('should throw BUS-016 for processing upload', async () => {
      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.PROCESSING,
      });

      await expect(service.retryUpload('test-uuid')).rejects.toThrow();
    });

    it('should throw BUS-016 for completed upload', async () => {
      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.COMPLETED,
      });

      await expect(service.retryUpload('test-uuid')).rejects.toThrow();
    });

    it('should throw BUS-016 for cancelled upload', async () => {
      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.CANCELLED,
      });

      await expect(service.retryUpload('test-uuid')).rejects.toThrow();
    });

    it('should throw BUS-002 when upload not found', async () => {
      uploadsRepository.findById.mockResolvedValue(null);

      await expect(service.retryUpload('missing')).rejects.toThrow();
    });

    it('should set processedRows to succeededRows on retry', async () => {
      const partialUpload = {
        ...mockUpload,
        status: UploadStatus.PARTIAL,
        processedRows: 100,
        succeededRows: 80,
        failedRows: 20,
      };
      uploadsRepository.findById.mockResolvedValue(partialUpload);
      uploadRowsRepository.resetFailedRows.mockResolvedValue(20);
      uploadsRepository.save.mockResolvedValue({
        ...partialUpload,
        status: UploadStatus.QUEUED,
      });

      await service.retryUpload('test-uuid');

      expect(uploadsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          processedRows: 80, // keeps succeeded count
          failedRows: 0,
        }),
      );
    });
  });

  describe('validateXlsxContent', () => {
    it('should validate a file with eventType and data rows', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'email', 'name'],
        [
          ['order.created', 'test@example.com', 'Test'],
          ['order.shipped', 'test2@example.com', 'Test2'],
        ],
      );

      const result = await service.validateXlsxContent(filePath);
      expect(result.totalRows).toBe(2);
      expect(result.headers).toContain('eventType');
      expect(result.hasItemColumns).toBe(false);
      expect(result.groupKeyColumn).toBeNull();
    });

    it('should detect group mode with item columns', async () => {
      const filePath = await createTestXlsx(
        ['eventType', 'orderId', 'item.sku', 'item.qty'],
        [['order.shipped', 'ORD-1', 'SKU-1', 1]],
      );

      const result = await service.validateXlsxContent(filePath);
      expect(result.hasItemColumns).toBe(true);
      expect(result.groupKeyColumn).toBe('orderId');
    });

    it('should reject file exceeding row limit', async () => {
      // Create file with more rows than allowed (using a smaller limit for testing)
      const configServiceOverride = {
        get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'app.uploadMaxRows') return 2;
          return configService.get(key, defaultValue);
        }),
      } as any;

      const testService = new UploadsService(
        uploadsRepository,
        uploadRowsRepository,
        configServiceOverride,
        metricsService,
      );

      const filePath = await createTestXlsx(
        ['eventType'],
        [['a'], ['b'], ['c']],
      );

      await expect(testService.validateXlsxContent(filePath)).rejects.toThrow();
    });
  });
});
