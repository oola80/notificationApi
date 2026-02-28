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

describe('Group Mode E2E', () => {
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

  function setupGroupMode() {
    mockParsingService.parseHeaders.mockResolvedValue([
      'eventType',
      'orderId',
      'customerName',
      'item.sku',
      'item.quantity',
    ]);
    mockParsingService.detectMode.mockReturnValue({
      mode: 'group',
      itemColumns: ['item.sku', 'item.quantity'],
      orderColumns: ['orderId', 'customerName'],
    });
    mockParsingService.parseRows.mockImplementation(async function* () {
      yield {
        rowNumber: 1,
        data: {
          eventType: 'order.created',
          orderId: 'ORD-001',
          customerName: 'Alice',
          'item.sku': 'SKU-A',
          'item.quantity': 2,
        },
      };
      yield {
        rowNumber: 2,
        data: {
          eventType: 'order.created',
          orderId: 'ORD-001',
          customerName: 'Alice',
          'item.sku': 'SKU-B',
          'item.quantity': 1,
        },
      };
    });
    mockParsingService.extractGroupData.mockReturnValue(
      new Map([
        [
          'order.created::ORD-001',
          {
            orderData: { orderId: 'ORD-001', customerName: 'Alice' },
            items: [
              { sku: 'SKU-A', quantity: 2 },
              { sku: 'SKU-B', quantity: 1 },
            ],
            rowNumbers: [1, 2],
            conflicts: [],
          },
        ],
      ]),
    );
  }

  beforeEach(() => {
    mockUploadsRepo = createMockUploadsRepository();
    mockRowsRepo = createMockUploadRowsRepository();
    mockAuditPublisher = createMockAuditPublisher();
    mockMetrics = createMockMetricsService();
    mockEventIngestion = createMockEventIngestionClient();

    mockParsingService = {
      parseHeaders: jest.fn(),
      parseRows: jest.fn(),
      detectMode: jest.fn(),
      extractGroupData: jest.fn(),
    };

    mockResultsService = {
      generateResult: jest.fn().mockResolvedValue('/results/result.xlsx'),
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
          'app.workerPollIntervalMs': 999999,
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
    (service as any).running = false;
    if ((service as any).pollingTimer) {
      clearTimeout((service as any).pollingTimer);
    }
  });

  describe('Group mode auto-detection', () => {
    it('should detect group mode with item.* columns', async () => {
      setupGroupMode();

      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'group.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/group.xlsx',
      });

      mockEventIngestion.submitEvent.mockResolvedValue({
        success: true,
        eventId: 'evt-001',
      });

      await service.processUpload(upload);

      expect(mockParsingService.detectMode).toHaveBeenCalled();
      const detectCall = mockParsingService.detectMode.mock.results[0];
      expect(detectCall.value.mode).toBe('group');
    });

    it('should group rows by eventType + groupKeyColumn', async () => {
      setupGroupMode();

      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'group.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/group.xlsx',
      });

      mockEventIngestion.submitEvent.mockResolvedValue({
        success: true,
        eventId: 'evt-001',
      });

      await service.processUpload(upload);

      expect(mockParsingService.extractGroupData).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'group' }),
        expect.any(Array),
        'warn',
      );
    });

    it('should record group size metric', async () => {
      setupGroupMode();

      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'group.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/group.xlsx',
      });

      await service.processUpload(upload);

      expect(mockMetrics.observeGroupSize).toHaveBeenCalledWith(2);
    });
  });

  describe('Group mode with conflicts (warn mode)', () => {
    it('should log warning but continue processing', async () => {
      setupGroupMode();
      // Override extractGroupData to include conflicts
      mockParsingService.extractGroupData.mockReturnValue(
        new Map([
          [
            'order.created::ORD-001',
            {
              orderData: { orderId: 'ORD-001', customerName: 'Alice' },
              items: [
                { sku: 'SKU-A', quantity: 2 },
                { sku: 'SKU-B', quantity: 1 },
              ],
              rowNumbers: [1, 2],
              conflicts: [
                "Field 'customerName' differs: 'Alice' vs 'Bob'",
              ],
            },
          ],
        ]),
      );

      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'conflict-warn.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/conflict-warn.xlsx',
      });

      mockEventIngestion.submitEvent.mockResolvedValue({
        success: true,
        eventId: 'evt-001',
      });

      await service.processUpload(upload);

      // Should still succeed despite conflicts in warn mode
      const updatedUpload = await mockUploadsRepo.findById(upload.id);
      expect(updatedUpload?.status).toBe(UploadStatus.COMPLETED);
    });
  });

  describe('Group event payload', () => {
    it('should update totalEvents to number of groups', async () => {
      setupGroupMode();

      const upload = await mockUploadsRepo.create({
        id: uuidv4(),
        fileName: 'group.xlsx',
        fileSize: 1024,
        totalRows: 2,
        status: UploadStatus.PROCESSING,
        uploadedBy: '00000000-0000-0000-0000-000000000000',
        originalFilePath: '/tmp/group.xlsx',
      });

      await service.processUpload(upload);

      // totalEvents should be set to number of groups (1)
      expect(mockUploadsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ totalEvents: 1 }),
      );
    });
  });
});
