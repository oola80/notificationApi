import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DtoValidationPipe } from '../src/common/pipes/dto-validation.pipe';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

export async function createTestApp(
  moduleOverrides: any,
): Promise<INestApplication> {
  const moduleFixture: TestingModule =
    await Test.createTestingModule(moduleOverrides).compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new DtoValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  // LoggingInterceptor requires PinoLogger DI — skip in E2E tests
  await app.init();
  return app;
}

export function createMockUploadsRepository() {
  const uploads = new Map<string, any>();
  return {
    create: jest.fn(async (data: any) => {
      const upload = {
        ...data,
        processedRows: data.processedRows ?? 0,
        succeededRows: data.succeededRows ?? 0,
        failedRows: data.failedRows ?? 0,
        totalEvents: data.totalEvents ?? null,
        resultFilePath: data.resultFilePath ?? null,
        resultGeneratedAt: data.resultGeneratedAt ?? null,
        startedAt: data.startedAt ?? null,
        completedAt: data.completedAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      uploads.set(data.id, upload);
      return upload;
    }),
    findById: jest.fn(async (id: string) => uploads.get(id) ?? null),
    findWithFilters: jest.fn(async () => ({
      data: Array.from(uploads.values()),
      page: 1,
      limit: 20,
      total: uploads.size,
    })),
    save: jest.fn(async (upload: any) => {
      uploads.set(upload.id, { ...upload, updatedAt: new Date() });
      return upload;
    }),
    delete: jest.fn(async (id: string) => {
      uploads.delete(id);
    }),
    updateStatus: jest.fn(async (id: string, status: string) => {
      const upload = uploads.get(id);
      if (upload) {
        upload.status = status;
        upload.updatedAt = new Date();
        return true;
      }
      return false;
    }),
    updateCounters: jest.fn(
      async (id: string, succeeded: number, failed: number) => {
        const upload = uploads.get(id);
        if (upload) {
          upload.processedRows += succeeded + failed;
          upload.succeededRows += succeeded;
          upload.failedRows += failed;
        }
      },
    ),
    claimNextQueued: jest.fn(async () => null),
    _uploads: uploads,
    _reset: () => uploads.clear(),
  };
}

export function createMockUploadRowsRepository() {
  const rows = new Map<string, any>();
  return {
    bulkInsert: jest.fn(async (insertRows: any[]) => {
      for (const row of insertRows) {
        rows.set(row.id, row);
      }
    }),
    findByUploadId: jest.fn(async (uploadId: string, page = 1, limit = 50) => {
      const uploadRows = Array.from(rows.values()).filter(
        (r) => r.uploadId === uploadId,
      );
      return {
        data: uploadRows.slice((page - 1) * limit, page * limit),
        page,
        limit,
        total: uploadRows.length,
      };
    }),
    findFailedByUploadId: jest.fn(
      async (uploadId: string, page = 1, limit = 50) => {
        const failedRows = Array.from(rows.values()).filter(
          (r) =>
            r.uploadId === uploadId &&
            (r.status === 'failed' || r.status === 'skipped'),
        );
        return {
          data: failedRows.slice((page - 1) * limit, page * limit),
          page,
          limit,
          total: failedRows.length,
        };
      },
    ),
    findPendingBatch: jest.fn(
      async (uploadId: string, limit: number, offset: number) => {
        const pendingRows = Array.from(rows.values()).filter(
          (r) => r.uploadId === uploadId && r.status === 'pending',
        );
        return {
          data: pendingRows.slice(offset, offset + limit),
          page: 1,
          limit,
          total: pendingRows.length,
        };
      },
    ),
    updateRowStatus: jest.fn(
      async (
        id: string,
        status: string,
        errorMessage?: string,
        eventId?: string,
      ) => {
        const row = rows.get(id);
        if (row) {
          row.status = status;
          row.errorMessage = errorMessage ?? null;
          row.eventId = eventId ?? null;
          row.processedAt = new Date();
        }
      },
    ),
    countByStatus: jest.fn(async (uploadId: string) => {
      const uploadRows = Array.from(rows.values()).filter(
        (r) => r.uploadId === uploadId,
      );
      const counts: Record<string, number> = {};
      for (const row of uploadRows) {
        counts[row.status] = (counts[row.status] ?? 0) + 1;
      }
      return counts;
    }),
    resetFailedRows: jest.fn(async (uploadId: string) => {
      let count = 0;
      for (const row of rows.values()) {
        if (
          row.uploadId === uploadId &&
          (row.status === 'failed' || row.status === 'skipped')
        ) {
          row.status = 'pending';
          row.errorMessage = null;
          count++;
        }
      }
      return count;
    }),
    updateGroupRowStatuses: jest.fn(),
    deleteByUploadId: jest.fn(async (uploadId: string) => {
      for (const [id, row] of rows) {
        if (row.uploadId === uploadId) rows.delete(id);
      }
    }),
    _rows: rows,
    _reset: () => rows.clear(),
  };
}

export function createMockAuditPublisher() {
  return {
    publishUploadCreated: jest.fn(),
    publishUploadProcessing: jest.fn(),
    publishUploadProgress: jest.fn(),
    publishUploadCompleted: jest.fn(),
    publishUploadCancelled: jest.fn(),
    publishUploadRetried: jest.fn(),
  };
}

export function createMockMetricsService() {
  return {
    registry: {
      metrics: jest.fn().mockResolvedValue('# HELP bus_uploads_total\n'),
    },
    incrementUploads: jest.fn(),
    incrementRows: jest.fn(),
    observeFileSize: jest.fn(),
    observeDuration: jest.fn(),
    setActiveUploads: jest.fn(),
    observeWorkerProcessingDuration: jest.fn(),
    observeWorkerBatchDuration: jest.fn(),
    observeEventSubmissionDuration: jest.fn(),
    incrementEventSubmission: jest.fn(),
    setWorkerActiveUploads: jest.fn(),
    setRowsPerSecond: jest.fn(),
    setCircuitBreakerState: jest.fn(),
    incrementCircuitBreakerTrips: jest.fn(),
    observeRateLimiterWait: jest.fn(),
    observeGroupSize: jest.fn(),
    incrementRetry: jest.fn(),
    incrementRabbitMQPublish: jest.fn(),
    observeRabbitMQPublishDuration: jest.fn(),
    onModuleInit: jest.fn(),
  };
}

export function createMockEventIngestionClient() {
  return {
    submitEvent: jest.fn().mockResolvedValue({
      success: true,
      eventId: 'evt-001',
    }),
  };
}
