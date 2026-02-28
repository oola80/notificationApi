import { ConfigService } from '@nestjs/config';
import { ParsingService } from '../parsing/parsing.service.js';
import {
  EventIngestionClient,
  SubmitEventPayload,
} from '../event-ingestion/event-ingestion.client.js';
import { ResultsService } from '../results/results.service.js';
import { UploadsRepository } from '../uploads/uploads.repository.js';
import { UploadRowsRepository } from '../uploads/upload-rows.repository.js';
import { Upload, UploadStatus } from '../uploads/entities/upload.entity.js';
import { UploadRowStatus } from '../uploads/entities/upload-row.entity.js';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  CircuitBreakerService,
  CircuitBreakerState,
} from '../circuit-breaker/circuit-breaker.service.js';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service.js';
import { ProcessingService } from './processing.service.js';

describe('ProcessingService', () => {
  let service: ProcessingService;
  let configService: jest.Mocked<ConfigService>;
  let parsingService: jest.Mocked<ParsingService>;
  let eventIngestionClient: jest.Mocked<EventIngestionClient>;
  let resultsService: jest.Mocked<ResultsService>;
  let uploadsRepository: jest.Mocked<UploadsRepository>;
  let uploadRowsRepository: jest.Mocked<UploadRowsRepository>;
  let metricsService: jest.Mocked<MetricsService>;
  let circuitBreaker: jest.Mocked<CircuitBreakerService>;
  let rateLimiter: jest.Mocked<RateLimiterService>;

  const mockUpload: Upload = {
    id: 'upload-123',
    fileName: 'test.xlsx',
    fileSize: 1024,
    totalRows: 3,
    totalEvents: null,
    processedRows: 0,
    succeededRows: 0,
    failedRows: 0,
    status: UploadStatus.PROCESSING,
    uploadedBy: '00000000-0000-0000-0000-000000000000',
    originalFilePath: '/uploads/temp/upload-123/original.xlsx',
    resultFilePath: null,
    resultGeneratedAt: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function createMocks() {
    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'app.workerPollIntervalMs': 100,
          'app.workerBatchSize': 50,
          'app.workerConcurrency': 5,
          'app.groupItemsTargetField': 'items',
          'app.groupConflictMode': 'warn',
          'app.groupKeyColumn': 'orderId',
          'app.groupItemsPrefix': 'item.',
        };
        return config[key] ?? defaultValue;
      }),
    } as any;

    parsingService = {
      parseHeaders: jest.fn().mockResolvedValue(['eventType', 'email', 'name']),
      parseRows: jest.fn(),
      detectMode: jest.fn().mockReturnValue({
        mode: 'standard',
        itemColumns: [],
        orderColumns: ['email', 'name'],
      }),
      extractGroupData: jest.fn(),
    } as any;

    eventIngestionClient = {
      submitEvent: jest.fn(),
    } as any;

    resultsService = {
      generateResult: jest
        .fn()
        .mockResolvedValue('/uploads/results/upload-123/result.xlsx'),
    } as any;

    uploadsRepository = {
      claimNextQueued: jest.fn(),
      findById: jest.fn(),
      updateCounters: jest.fn(),
      updateStatus: jest.fn(),
      save: jest.fn(),
    } as any;

    uploadRowsRepository = {
      bulkInsert: jest.fn(),
      findPendingBatch: jest.fn(),
      updateRowStatus: jest.fn(),
      countByStatus: jest.fn(),
      resetFailedRows: jest.fn(),
      updateGroupRowStatuses: jest.fn(),
    } as any;

    metricsService = {
      setActiveUploads: jest.fn(),
      observeDuration: jest.fn(),
      incrementUploads: jest.fn(),
      incrementRows: jest.fn(),
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
    } as any;

    circuitBreaker = {
      canExecute: jest.fn().mockReturnValue(true),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
      getState: jest.fn().mockReturnValue(CircuitBreakerState.CLOSED),
      getConsecutiveFailures: jest.fn().mockReturnValue(0),
      getCooldownMs: jest.fn().mockReturnValue(30000),
      getTimeUntilRetry: jest.fn().mockReturnValue(0),
      reset: jest.fn(),
    } as any;

    rateLimiter = {
      acquire: jest.fn().mockResolvedValue(0),
      tryAcquire: jest.fn().mockReturnValue(true),
      getAvailableTokens: jest.fn().mockReturnValue(50),
    } as any;
  }

  beforeEach(() => {
    createMocks();

    service = new ProcessingService(
      configService,
      parsingService,
      eventIngestionClient,
      resultsService,
      uploadsRepository,
      uploadRowsRepository,
      metricsService,
      circuitBreaker,
      rateLimiter,
    );
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  function mockParseRows(
    rows: Array<{ rowNumber: number; data: Record<string, unknown> }>,
  ) {
    parsingService.parseRows.mockReturnValue(
      (async function* () {
        for (const row of rows) {
          yield row;
        }
      })(),
    );
  }

  // Default setup: no existing rows (fresh upload)
  function setupFreshUpload() {
    uploadRowsRepository.countByStatus.mockResolvedValueOnce({});
  }

  describe('processUpload — standard mode', () => {
    it('should process a successful upload end-to-end', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
        {
          rowNumber: 2,
          data: { eventType: 'order.shipped', email: 'test2@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
            {
              id: 'row-2',
              rowNumber: 2,
              rawData: {
                eventType: 'order.shipped',
                email: 'test2@example.com',
              },
            },
          ],
          total: 2,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({
          data: [],
          total: 0,
          page: 1,
          limit: 50,
        });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });

      eventIngestionClient.submitEvent
        .mockResolvedValueOnce({ success: true, eventId: 'evt-1' })
        .mockResolvedValueOnce({ success: true, eventId: 'evt-2' });

      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.SUCCEEDED]: 2,
      });

      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(uploadRowsRepository.bulkInsert).toHaveBeenCalled();
      expect(eventIngestionClient.submitEvent).toHaveBeenCalledTimes(2);
      expect(uploadsRepository.updateCounters).toHaveBeenCalled();
      expect(resultsService.generateResult).toHaveBeenCalledWith('upload-123');
      expect(uploadsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UploadStatus.COMPLETED,
        }),
      );
    });

    it('should set status to PARTIAL when some rows fail', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
        {
          rowNumber: 2,
          data: { eventType: 'order.unknown', email: 'test2@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
            {
              id: 'row-2',
              rowNumber: 2,
              rawData: {
                eventType: 'order.unknown',
                email: 'test2@example.com',
              },
            },
          ],
          total: 2,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });

      eventIngestionClient.submitEvent
        .mockResolvedValueOnce({ success: true, eventId: 'evt-1' })
        .mockResolvedValueOnce({
          success: false,
          error: 'No mapping found',
          statusCode: 422,
        });

      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.SUCCEEDED]: 1,
        [UploadRowStatus.FAILED]: 1,
      });

      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(uploadsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UploadStatus.PARTIAL,
        }),
      );
    });

    it('should set status to FAILED when all rows fail', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.unknown', email: 'test@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.unknown',
                email: 'test@example.com',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });

      eventIngestionClient.submitEvent.mockResolvedValueOnce({
        success: false,
        error: 'No mapping found',
        statusCode: 422,
      });

      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.FAILED]: 1,
      });

      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(uploadsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UploadStatus.FAILED,
        }),
      );
    });

    it('should skip rows without eventType', async () => {
      setupFreshUpload();
      mockParseRows([
        { rowNumber: 1, data: { email: 'test@example.com' } },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: { email: 'test@example.com' },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });

      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.SKIPPED]: 1,
      });

      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(uploadRowsRepository.updateRowStatus).toHaveBeenCalledWith(
        'row-1',
        UploadRowStatus.SKIPPED,
        "Missing required 'eventType' value",
      );
      expect(eventIngestionClient.submitEvent).not.toHaveBeenCalled();
    });

    it('should build correct event payload', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: {
            eventType: 'order.created',
            cycleId: 'CYC-001',
            email: 'test@example.com',
            orderId: 'ORD-001',
            _internal: 'hidden',
          },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                cycleId: 'CYC-001',
                email: 'test@example.com',
                orderId: 'ORD-001',
                _internal: 'hidden',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });

      eventIngestionClient.submitEvent.mockResolvedValueOnce({
        success: true,
        eventId: 'evt-1',
      });

      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.SUCCEEDED]: 1,
      });

      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      const payload =
        eventIngestionClient.submitEvent.mock.calls[0][0] as SubmitEventPayload;

      expect(payload.sourceId).toBe('bulk-upload');
      expect(payload.cycleId).toBe('CYC-001');
      expect(payload.eventType).toBe('order.created');
      expect(payload.sourceEventId).toBe('upload-123-row-1');
      expect(payload.payload).toEqual({
        email: 'test@example.com',
        orderId: 'ORD-001',
      });
      expect(payload.payload).not.toHaveProperty('eventType');
      expect(payload.payload).not.toHaveProperty('cycleId');
      expect(payload.payload).not.toHaveProperty('_internal');
    });

    it('should use uploadId as cycleId when no cycleId column', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });

      eventIngestionClient.submitEvent.mockResolvedValueOnce({
        success: true,
        eventId: 'evt-1',
      });

      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.SUCCEEDED]: 1,
      });

      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      const payload = eventIngestionClient.submitEvent.mock.calls[0][0];
      expect(payload.cycleId).toBe('upload-123');
    });

    it('should handle parsing failure gracefully', async () => {
      setupFreshUpload();
      parsingService.parseHeaders.mockRejectedValue(
        new Error('Corrupt file'),
      );

      await service.processUpload(mockUpload);

      expect(uploadsRepository.updateStatus).toHaveBeenCalledWith(
        'upload-123',
        UploadStatus.FAILED,
      );
      expect(metricsService.incrementUploads).toHaveBeenCalledWith('failed');
    });

    it('should handle result generation failure gracefully', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });

      eventIngestionClient.submitEvent.mockResolvedValueOnce({
        success: true,
        eventId: 'evt-1',
      });

      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.SUCCEEDED]: 1,
      });

      resultsService.generateResult.mockRejectedValue(
        new Error('Disk full'),
      );

      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(uploadsRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: UploadStatus.COMPLETED,
          resultFilePath: null,
        }),
      );
    });

    it('should stop processing if upload is cancelled', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch.mockResolvedValueOnce({
        data: [
          {
            id: 'row-1',
            rowNumber: 1,
            rawData: {
              eventType: 'order.created',
              email: 'test@example.com',
            },
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      });

      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        status: UploadStatus.CANCELLED,
      });

      uploadRowsRepository.countByStatus.mockResolvedValue({});
      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(eventIngestionClient.submitEvent).not.toHaveBeenCalled();
    });

    it('should set metrics during processing', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });
      eventIngestionClient.submitEvent.mockResolvedValueOnce({
        success: true,
        eventId: 'evt-1',
      });
      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.SUCCEEDED]: 1,
      });
      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(metricsService.setActiveUploads).toHaveBeenCalledWith(1);
      expect(metricsService.setActiveUploads).toHaveBeenCalledWith(0);
      expect(
        metricsService.observeWorkerProcessingDuration,
      ).toHaveBeenCalled();
      expect(metricsService.observeWorkerBatchDuration).toHaveBeenCalled();
      expect(
        metricsService.observeEventSubmissionDuration,
      ).toHaveBeenCalled();
      expect(metricsService.incrementEventSubmission).toHaveBeenCalledWith(
        'success',
      );
    });
  });

  describe('circuit breaker integration', () => {
    it('should record success on circuit breaker after successful submission', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });
      eventIngestionClient.submitEvent.mockResolvedValueOnce({
        success: true,
        eventId: 'evt-1',
      });
      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.SUCCEEDED]: 1,
      });
      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(circuitBreaker.recordSuccess).toHaveBeenCalled();
    });

    it('should record failure on circuit breaker for 5xx errors', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });
      eventIngestionClient.submitEvent.mockResolvedValueOnce({
        success: false,
        error: 'Internal server error',
        statusCode: 500,
      });
      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.FAILED]: 1,
      });
      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(circuitBreaker.recordFailure).toHaveBeenCalled();
    });

    it('should NOT record failure on circuit breaker for 4xx errors', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });
      eventIngestionClient.submitEvent.mockResolvedValueOnce({
        success: false,
        error: 'Validation error',
        statusCode: 422,
      });
      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.FAILED]: 1,
      });
      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(circuitBreaker.recordFailure).not.toHaveBeenCalled();
    });

    it('should record failure on circuit breaker for thrown exceptions', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });
      eventIngestionClient.submitEvent.mockRejectedValueOnce(
        new Error('Connection refused'),
      );
      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.FAILED]: 1,
      });
      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(circuitBreaker.recordFailure).toHaveBeenCalled();
    });
  });

  describe('rate limiter integration', () => {
    it('should call rateLimiter.acquire before each event submission', async () => {
      setupFreshUpload();
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });
      eventIngestionClient.submitEvent.mockResolvedValueOnce({
        success: true,
        eventId: 'evt-1',
      });
      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.SUCCEEDED]: 1,
      });
      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(rateLimiter.acquire).toHaveBeenCalled();
    });

    it('should observe rate limiter wait time when > 0', async () => {
      setupFreshUpload();
      rateLimiter.acquire.mockResolvedValue(0.5);
      mockParseRows([
        {
          rowNumber: 1,
          data: { eventType: 'order.created', email: 'test@example.com' },
        },
      ]);

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 1,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });
      eventIngestionClient.submitEvent.mockResolvedValueOnce({
        success: true,
        eventId: 'evt-1',
      });
      uploadRowsRepository.countByStatus.mockResolvedValue({
        [UploadRowStatus.SUCCEEDED]: 1,
      });
      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      expect(metricsService.observeRateLimiterWait).toHaveBeenCalledWith(0.5);
    });
  });

  describe('retry mode', () => {
    it('should skip row insertion for retried uploads with existing rows', async () => {
      // First countByStatus returns existing rows (retry case)
      uploadRowsRepository.countByStatus.mockResolvedValueOnce({
        [UploadRowStatus.SUCCEEDED]: 5,
        [UploadRowStatus.PENDING]: 3,
      });

      // Second countByStatus for final status
      uploadRowsRepository.countByStatus.mockResolvedValueOnce({
        [UploadRowStatus.SUCCEEDED]: 8,
      });

      uploadRowsRepository.findPendingBatch
        .mockResolvedValueOnce({
          data: [
            {
              id: 'row-1',
              rowNumber: 6,
              rawData: {
                eventType: 'order.created',
                email: 'test@example.com',
              },
            },
          ],
          total: 3,
          page: 1,
          limit: 50,
        })
        .mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 });

      uploadsRepository.findById.mockResolvedValue({ ...mockUpload });
      eventIngestionClient.submitEvent.mockResolvedValue({
        success: true,
        eventId: 'evt-1',
      });
      uploadsRepository.save.mockResolvedValue({ ...mockUpload });

      await service.processUpload(mockUpload);

      // Should NOT call bulkInsert (rows already exist)
      expect(uploadRowsRepository.bulkInsert).not.toHaveBeenCalled();
      // Should still process pending rows
      expect(eventIngestionClient.submitEvent).toHaveBeenCalled();
    });
  });

  describe('onModuleInit', () => {
    it('should start polling on init', () => {
      service.onModuleInit();
      expect((service as any).running).toBe(true);
    });
  });

  describe('onModuleDestroy', () => {
    it('should stop polling on destroy', async () => {
      service.onModuleInit();
      await service.onModuleDestroy();
      expect((service as any).running).toBe(false);
    });

    it('should mark current upload as failed on shutdown', async () => {
      (service as any).currentUploadId = 'in-progress-upload';
      uploadsRepository.updateStatus.mockResolvedValue({} as Upload);

      await service.onModuleDestroy();

      expect(uploadsRepository.updateStatus).toHaveBeenCalledWith(
        'in-progress-upload',
        UploadStatus.FAILED,
      );
    });

    it('should handle failed status update on shutdown gracefully', async () => {
      (service as any).currentUploadId = 'in-progress-upload';
      uploadsRepository.updateStatus.mockRejectedValue(
        new Error('DB connection lost'),
      );

      await service.onModuleDestroy();
    });
  });
});
