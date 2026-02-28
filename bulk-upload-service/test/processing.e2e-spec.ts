import { v4 as uuidv4 } from 'uuid';
import { ProcessingService } from '../src/processing/processing.service';
import { UploadStatus } from '../src/uploads/entities/upload.entity';
import { UploadRowStatus } from '../src/uploads/entities/upload-row.entity';
import {
  createMockUploadsRepository,
  createMockUploadRowsRepository,
  createMockAuditPublisher,
  createMockMetricsService,
  createMockEventIngestionClient,
} from './test-utils';

describe('Processing E2E', () => {
  let service: ProcessingService;
  let mockUploadsRepo: ReturnType<typeof createMockUploadsRepository>;
  let mockRowsRepo: ReturnType<typeof createMockUploadRowsRepository>;
  let mockAuditPublisher: ReturnType<typeof createMockAuditPublisher>;
  let mockMetrics: ReturnType<typeof createMockMetricsService>;
  let mockEventIngestion: ReturnType<typeof createMockEventIngestionClient>;
  let mockParsingService: any;
  let mockResultsService: any;
  let mockCircuitBreaker: any;
  let mockRateLimiter: any;

  beforeEach(() => {
    mockUploadsRepo = createMockUploadsRepository();
    mockRowsRepo = createMockUploadRowsRepository();
    mockAuditPublisher = createMockAuditPublisher();
    mockMetrics = createMockMetricsService();
    mockEventIngestion = createMockEventIngestionClient();

    mockParsingService = {
      parseHeaders: jest.fn().mockResolvedValue(['eventType', 'orderId', 'amount']),
      parseRows: jest.fn().mockImplementation(async function* () {
        yield { rowNumber: 1, data: { eventType: 'order.created', orderId: 'ORD-001', amount: 99.99 } };
        yield { rowNumber: 2, data: { eventType: 'order.created', orderId: 'ORD-002', amount: 49.99 } };
      }),
      detectMode: jest.fn().mockReturnValue({
        mode: 'standard',
        itemColumns: [],
        orderColumns: ['orderId', 'amount'],
      }),
      extractGroupData: jest.fn(),
    };

    mockResultsService = {
      generateResult: jest.fn().mockResolvedValue('/results/upload-id/result.xlsx'),
    };

    mockCircuitBreaker = {
      canExecute: jest.fn().mockReturnValue(true),
      recordSuccess: jest.fn(),
      recordFailure: jest.fn(),
      getState: jest.fn().mockReturnValue('CLOSED'),
      getTimeUntilRetry: jest.fn().mockReturnValue(0),
    };

    mockRateLimiter = {
      acquire: jest.fn().mockResolvedValue(0),
    };

    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'app.workerPollIntervalMs': 999999, // don't poll during tests
          'app.workerBatchSize': 50,
          'app.workerConcurrency': 5,
          'app.groupItemsTargetField': 'items',
          'app.groupConflictMode': 'warn',
          'app.groupKeyColumn': 'orderId',
        };
        return config[key] ?? defaultValue;
      }),
    };

    service = new ProcessingService(
      mockConfigService as any,
      mockParsingService,
      mockEventIngestion,
      mockResultsService,
      mockUploadsRepo as any,
      mockRowsRepo as any,
      mockMetrics as any,
      mockCircuitBreaker,
      mockRateLimiter,
      mockAuditPublisher as any,
    );
  });

  afterEach(() => {
    // Prevent polling
    (service as any).running = false;
    if ((service as any).pollingTimer) {
      clearTimeout((service as any).pollingTimer);
    }
  });

  describe('Standard mode — all rows succeed', () => {
    it('should complete upload with status=completed', async () => {
      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'test.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/test.xlsx',
      });

      mockEventIngestion.submitEvent.mockResolvedValue({
        success: true,
        eventId: 'evt-001',
      });

      await service.processUpload(upload);

      expect(mockAuditPublisher.publishUploadProcessing).toHaveBeenCalled();
      expect(mockAuditPublisher.publishUploadCompleted).toHaveBeenCalled();
      expect(mockResultsService.generateResult).toHaveBeenCalledWith(upload.id);

      // Check that upload was marked as completed
      const updatedUpload = await mockUploadsRepo.findById(upload.id);
      expect(updatedUpload?.status).toBe(UploadStatus.COMPLETED);
    });
  });

  describe('Standard mode — some rows fail', () => {
    it('should complete upload with status=partial', async () => {
      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'test.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/test.xlsx',
      });

      mockEventIngestion.submitEvent
        .mockResolvedValueOnce({ success: true, eventId: 'evt-001' })
        .mockResolvedValueOnce({
          success: false,
          error: 'Bad request',
          statusCode: 400,
        });

      await service.processUpload(upload);

      const updatedUpload = await mockUploadsRepo.findById(upload.id);
      expect(updatedUpload?.status).toBe(UploadStatus.PARTIAL);
      expect(mockAuditPublisher.publishUploadCompleted).toHaveBeenCalled();
    });
  });

  describe('Standard mode — all rows fail', () => {
    it('should complete upload with status=failed', async () => {
      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'test.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/test.xlsx',
      });

      mockEventIngestion.submitEvent.mockResolvedValue({
        success: false,
        error: 'Internal error',
        statusCode: 500,
      });

      await service.processUpload(upload);

      const updatedUpload = await mockUploadsRepo.findById(upload.id);
      expect(updatedUpload?.status).toBe(UploadStatus.FAILED);
    });
  });

  describe('Result file generation', () => {
    it('should call resultsService.generateResult after processing', async () => {
      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'test.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/test.xlsx',
      });

      await service.processUpload(upload);

      expect(mockResultsService.generateResult).toHaveBeenCalledWith(
        upload.id,
      );
    });

    it('should still complete if result generation fails', async () => {
      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'test.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/test.xlsx',
      });

      mockResultsService.generateResult.mockRejectedValue(
        new Error('Disk full'),
      );

      await service.processUpload(upload);

      const updatedUpload = await mockUploadsRepo.findById(upload.id);
      expect(updatedUpload?.status).toBeDefined(); // Still gets a final status
      expect(updatedUpload?.resultFilePath).toBeNull();
    });
  });

  describe('Audit publishing', () => {
    it('should publish processing event at start', async () => {
      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'test.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/test.xlsx',
      });

      await service.processUpload(upload);

      expect(mockAuditPublisher.publishUploadProcessing).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId: upload.id,
          status: 'processing',
        }),
      );
    });

    it('should publish progress event after batch', async () => {
      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'test.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/test.xlsx',
      });

      await service.processUpload(upload);

      expect(mockAuditPublisher.publishUploadProgress).toHaveBeenCalled();
    });

    it('should publish completed event at end', async () => {
      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'test.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/test.xlsx',
      });

      await service.processUpload(upload);

      expect(mockAuditPublisher.publishUploadCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId: upload.id,
        }),
      );
    });
  });
});
