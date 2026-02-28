import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';
import { UploadStatus } from './entities/upload.entity.js';

describe('UploadsController', () => {
  let controller: UploadsController;
  let service: jest.Mocked<UploadsService>;

  const mockUploadResponse = {
    uploadId: 'test-uuid',
    fileName: 'test.xlsx',
    fileSize: 1024,
    totalRows: 10,
    totalEvents: null,
    processedRows: 0,
    succeededRows: 0,
    failedRows: 0,
    status: 'queued',
    uploadedBy: '00000000-0000-0000-0000-000000000000',
    originalFilePath: '/uploads/temp/test-uuid/original.xlsx',
    resultFilePath: null,
    resultFileReady: false,
    startedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [
        {
          provide: UploadsService,
          useValue: {
            processUpload: jest.fn().mockResolvedValue(mockUploadResponse),
            findAll: jest.fn().mockResolvedValue({
              data: [mockUploadResponse],
              meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
            }),
            findById: jest.fn().mockResolvedValue(mockUploadResponse),
            getStatus: jest.fn().mockResolvedValue({
              uploadId: 'test-uuid',
              status: 'queued',
              totalRows: 10,
              processedRows: 0,
              succeededRows: 0,
              failedRows: 0,
              progressPercent: 0,
              estimatedTimeRemainingMs: null,
            }),
            getErrors: jest.fn().mockResolvedValue({
              data: [],
              meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
            }),
            cancelOrDelete: jest.fn().mockResolvedValue(undefined),
            retryUpload: jest.fn().mockResolvedValue({
              uploadId: 'test-uuid',
              status: 'queued',
              retryableRows: 3,
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<UploadsController>(UploadsController);
    service = module.get(UploadsService) as jest.Mocked<UploadsService>;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /uploads', () => {
    it('should call processUpload with file and uploadedBy', async () => {
      const mockFile = {
        originalname: 'test.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 1024,
        path: '/tmp/test.xlsx',
      } as Express.Multer.File;

      const result = await controller.uploadFile(mockFile);

      expect(service.processUpload).toHaveBeenCalledWith(
        mockFile,
        '00000000-0000-0000-0000-000000000000',
      );
      expect(result).toEqual(mockUploadResponse);
    });
  });

  describe('GET /uploads', () => {
    it('should call findAll with query params', async () => {
      const query = { page: 1, limit: 20 };
      const result = await controller.listUploads(query as any);

      expect(service.findAll).toHaveBeenCalledWith(query);
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should pass status filter', async () => {
      const query = { status: UploadStatus.COMPLETED, page: 1, limit: 20 };
      await controller.listUploads(query as any);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: UploadStatus.COMPLETED }),
      );
    });

    it('should pass date range filters', async () => {
      const query = {
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        page: 1,
        limit: 20,
      };
      await controller.listUploads(query as any);

      expect(service.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          dateFrom: '2026-01-01',
          dateTo: '2026-12-31',
        }),
      );
    });
  });

  describe('GET /uploads/:id', () => {
    it('should call findById with id', async () => {
      const result = await controller.getUpload('test-uuid');

      expect(service.findById).toHaveBeenCalledWith('test-uuid');
      expect(result).toEqual(mockUploadResponse);
    });
  });

  describe('GET /uploads/:id/status', () => {
    it('should call getStatus with id', async () => {
      const result = await controller.getUploadStatus('test-uuid');

      expect(service.getStatus).toHaveBeenCalledWith('test-uuid');
      expect(result).toHaveProperty('progressPercent');
    });
  });

  describe('GET /uploads/:id/errors', () => {
    it('should call getErrors with id and query', async () => {
      const query = { page: 1, limit: 50 };
      const result = await controller.getUploadErrors('test-uuid', query as any);

      expect(service.getErrors).toHaveBeenCalledWith('test-uuid', query);
      expect(result.data).toEqual([]);
    });
  });

  describe('GET /uploads/:id/result', () => {
    it('should throw BUS-015 if upload is still processing', async () => {
      service.findById.mockResolvedValue({
        ...mockUploadResponse,
        status: UploadStatus.PROCESSING,
      } as any);

      const mockRes = { set: jest.fn() } as any;

      await expect(
        controller.downloadResult('test-uuid', mockRes),
      ).rejects.toThrow();
    });

    it('should throw BUS-015 if upload is queued', async () => {
      service.findById.mockResolvedValue({
        ...mockUploadResponse,
        status: UploadStatus.QUEUED,
      } as any);

      const mockRes = { set: jest.fn() } as any;

      await expect(
        controller.downloadResult('test-uuid', mockRes),
      ).rejects.toThrow();
    });

    it('should throw BUS-002 if no result file exists', async () => {
      service.findById.mockResolvedValue({
        ...mockUploadResponse,
        status: UploadStatus.COMPLETED,
        resultFilePath: null,
      } as any);

      const mockRes = { set: jest.fn() } as any;

      await expect(
        controller.downloadResult('test-uuid', mockRes),
      ).rejects.toThrow();
    });

    it('should stream result file for completed upload', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctrl-test-'));
      const testFile = path.join(tempDir, 'result.xlsx');
      fs.writeFileSync(testFile, 'test content');

      service.findById.mockResolvedValue({
        ...mockUploadResponse,
        status: UploadStatus.COMPLETED,
        resultFilePath: testFile,
        fileName: 'orders.xlsx',
      } as any);

      const mockRes = { set: jest.fn() } as any;

      const result = await controller.downloadResult('test-uuid', mockRes);

      expect(mockRes.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="orders_result.xlsx"',
        }),
      );
      expect(result).toBeDefined();

      // Consume the stream before cleanup to prevent ENOENT
      const stream = (result as any).getStream?.() ?? result;
      if (stream && typeof stream.destroy === 'function') {
        stream.destroy();
      }

      // Small delay for stream cleanup before removing temp files
      await new Promise((resolve) => setTimeout(resolve, 50));
      fs.rmSync(tempDir, { recursive: true, force: true });
    });
  });

  describe('POST /uploads/:id/retry', () => {
    it('should call retryUpload with id', async () => {
      const result = await controller.retryUpload('test-uuid');

      expect(service.retryUpload).toHaveBeenCalledWith('test-uuid');
      expect(result).toEqual({
        uploadId: 'test-uuid',
        status: 'queued',
        retryableRows: 3,
      });
    });

    it('should propagate errors from service', async () => {
      service.retryUpload.mockRejectedValue(new Error('Not allowed'));

      await expect(controller.retryUpload('test-uuid')).rejects.toThrow(
        'Not allowed',
      );
    });
  });

  describe('DELETE /uploads/:id', () => {
    it('should call cancelOrDelete with id', async () => {
      await controller.cancelOrDelete('test-uuid');

      expect(service.cancelOrDelete).toHaveBeenCalledWith('test-uuid');
    });
  });
});
