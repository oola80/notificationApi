import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import {
  createTestApp,
  createMockUploadsRepository,
  createMockUploadRowsRepository,
  createMockAuditPublisher,
  createMockMetricsService,
} from './test-utils';
import { UploadsController } from '../src/uploads/uploads.controller';
import { UploadsService } from '../src/uploads/uploads.service';
import { UploadsRepository } from '../src/uploads/uploads.repository';
import { UploadRowsRepository } from '../src/uploads/upload-rows.repository';
import { MetricsService } from '../src/metrics/metrics.service';
import { AuditPublisherService } from '../src/rabbitmq/audit-publisher.service';

describe('Retry E2E', () => {
  let app: INestApplication<App>;
  let mockUploadsRepo: ReturnType<typeof createMockUploadsRepository>;
  let mockRowsRepo: ReturnType<typeof createMockUploadRowsRepository>;
  let mockAuditPublisher: ReturnType<typeof createMockAuditPublisher>;
  let mockMetrics: ReturnType<typeof createMockMetricsService>;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        'app.uploadMaxFileSizeMb': 10,
        'app.uploadMaxRows': 5000,
        'app.uploadTempDir': './uploads/temp',
        'app.uploadResultDir': './uploads/results',
        'app.groupKeyColumn': 'orderId',
        'app.groupItemsPrefix': 'item.',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeAll(async () => {
    mockUploadsRepo = createMockUploadsRepository();
    mockRowsRepo = createMockUploadRowsRepository();
    mockAuditPublisher = createMockAuditPublisher();
    mockMetrics = createMockMetricsService();

    app = await createTestApp({
      controllers: [UploadsController],
      providers: [
        UploadsService,
        { provide: UploadsRepository, useValue: mockUploadsRepo },
        { provide: UploadRowsRepository, useValue: mockRowsRepo },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MetricsService, useValue: mockMetrics },
        { provide: AuditPublisherService, useValue: mockAuditPublisher },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockUploadsRepo._reset();
    mockRowsRepo._reset();
    jest.clearAllMocks();
  });

  describe('POST /uploads/:id/retry', () => {
    it('should retry a partial upload and return 202', async () => {
      const uploadId = uuidv4();
      await mockUploadsRepo.create({
        id: uploadId,
        fileName: 'partial.xlsx',
        fileSize: 1024,
        totalRows: 10,
        status: 'partial',
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        processedRows: 10,
        succeededRows: 7,
        failedRows: 3,
        originalFilePath: '/tmp/partial.xlsx',
      });

      // Insert failed rows
      for (let i = 0; i < 3; i++) {
        await mockRowsRepo.bulkInsert([
          {
            id: uuidv4(),
            uploadId,
            rowNumber: i + 8,
            rawData: { eventType: 'test' },
            status: 'failed',
            errorMessage: 'Server error',
          },
        ]);
      }

      const { body } = await request(app.getHttpServer())
        .post(`/uploads/${uploadId}/retry`)
        .expect(202);

      expect(body.uploadId).toBe(uploadId);
      expect(body.status).toBe('queued');
      expect(body.retryableRows).toBe(3);
      expect(mockAuditPublisher.publishUploadRetried).toHaveBeenCalled();
      expect(mockMetrics.incrementRetry).toHaveBeenCalled();
    });

    it('should retry a failed upload', async () => {
      const uploadId = uuidv4();
      await mockUploadsRepo.create({
        id: uploadId,
        fileName: 'failed.xlsx',
        fileSize: 1024,
        totalRows: 5,
        status: 'failed',
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        processedRows: 5,
        succeededRows: 0,
        failedRows: 5,
        originalFilePath: '/tmp/failed.xlsx',
      });

      for (let i = 0; i < 5; i++) {
        await mockRowsRepo.bulkInsert([
          {
            id: uuidv4(),
            uploadId,
            rowNumber: i + 1,
            rawData: { eventType: 'test' },
            status: 'failed',
            errorMessage: 'Connection refused',
          },
        ]);
      }

      const { body } = await request(app.getHttpServer())
        .post(`/uploads/${uploadId}/retry`)
        .expect(202);

      expect(body.retryableRows).toBe(5);
    });

    it('should return 409 for completed upload', async () => {
      const uploadId = uuidv4();
      await mockUploadsRepo.create({
        id: uploadId,
        fileName: 'completed.xlsx',
        fileSize: 1024,
        totalRows: 5,
        status: 'completed',
        uploadedBy: '00000000-0000-0000-0000-000000000000',
      });

      const { body } = await request(app.getHttpServer())
        .post(`/uploads/${uploadId}/retry`)
        .expect(409);

      expect(body.code).toBe('BUS-016');
    });

    it('should return 409 for queued upload', async () => {
      const uploadId = uuidv4();
      await mockUploadsRepo.create({
        id: uploadId,
        fileName: 'queued.xlsx',
        fileSize: 1024,
        totalRows: 5,
        status: 'queued',
        uploadedBy: '00000000-0000-0000-0000-000000000000',
      });

      const { body } = await request(app.getHttpServer())
        .post(`/uploads/${uploadId}/retry`)
        .expect(409);

      expect(body.code).toBe('BUS-016');
    });

    it('should only process failed/skipped rows on retry, not succeeded', async () => {
      const uploadId = uuidv4();
      await mockUploadsRepo.create({
        id: uploadId,
        fileName: 'partial-retry.xlsx',
        fileSize: 1024,
        totalRows: 3,
        status: 'partial',
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        processedRows: 3,
        succeededRows: 2,
        failedRows: 1,
        originalFilePath: '/tmp/partial-retry.xlsx',
      });

      // 2 succeeded rows
      for (let i = 0; i < 2; i++) {
        await mockRowsRepo.bulkInsert([
          {
            id: uuidv4(),
            uploadId,
            rowNumber: i + 1,
            rawData: { eventType: 'test' },
            status: 'succeeded',
          },
        ]);
      }
      // 1 failed row
      await mockRowsRepo.bulkInsert([
        {
          id: uuidv4(),
          uploadId,
          rowNumber: 3,
          rawData: { eventType: 'test' },
          status: 'failed',
          errorMessage: 'Server error',
        },
      ]);

      const { body } = await request(app.getHttpServer())
        .post(`/uploads/${uploadId}/retry`)
        .expect(202);

      // Should only reset the 1 failed row
      expect(body.retryableRows).toBe(1);

      // Upload counters should preserve succeeded count
      const upload = await mockUploadsRepo.findById(uploadId);
      expect(upload?.succeededRows).toBe(2);
      expect(upload?.failedRows).toBe(0);
      expect(upload?.processedRows).toBe(2);
    });

    it('should publish retried audit event', async () => {
      const uploadId = uuidv4();
      await mockUploadsRepo.create({
        id: uploadId,
        fileName: 'retry-audit.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: 'partial',
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        processedRows: 2,
        succeededRows: 1,
        failedRows: 1,
      });

      await mockRowsRepo.bulkInsert([
        {
          id: uuidv4(),
          uploadId,
          rowNumber: 2,
          rawData: { eventType: 'test' },
          status: 'failed',
          errorMessage: 'Error',
        },
      ]);

      await request(app.getHttpServer())
        .post(`/uploads/${uploadId}/retry`)
        .expect(202);

      expect(mockAuditPublisher.publishUploadRetried).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId,
          status: 'queued',
        }),
      );
    });
  });
});
