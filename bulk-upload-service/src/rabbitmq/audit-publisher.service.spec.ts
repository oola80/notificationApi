import { AuditPublisherService, AuditUploadData } from './audit-publisher.service.js';
import {
  EXCHANGE_NOTIFICATIONS_STATUS,
  ROUTING_KEY_UPLOAD_CREATED,
  ROUTING_KEY_UPLOAD_PROCESSING,
  ROUTING_KEY_UPLOAD_PROGRESS,
  ROUTING_KEY_UPLOAD_COMPLETED,
  ROUTING_KEY_UPLOAD_CANCELLED,
  ROUTING_KEY_UPLOAD_RETRIED,
} from './rabbitmq.constants.js';

describe('AuditPublisherService', () => {
  let service: AuditPublisherService;
  let mockAmqpConnection: any;
  let mockMetricsService: any;

  const sampleData: AuditUploadData = {
    uploadId: '123e4567-e89b-12d3-a456-426614174000',
    fileName: 'test.xlsx',
    uploadedBy: 'user-001',
    status: 'queued',
    totalRows: 100,
    processedRows: 0,
    succeededRows: 0,
    failedRows: 0,
  };

  beforeEach(() => {
    mockAmqpConnection = {
      publish: jest.fn().mockResolvedValue(true),
    };
    mockMetricsService = {
      incrementRabbitMQPublish: jest.fn(),
      observeRabbitMQPublishDuration: jest.fn(),
    };
    service = new AuditPublisherService(mockAmqpConnection, mockMetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publishUploadCreated', () => {
    it('should publish to status exchange with created routing key', () => {
      service.publishUploadCreated(sampleData);

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_STATUS,
        ROUTING_KEY_UPLOAD_CREATED,
        expect.objectContaining({
          eventId: expect.any(String),
          source: 'bulk-upload-service',
          type: ROUTING_KEY_UPLOAD_CREATED,
          timestamp: expect.any(String),
          data: sampleData,
        }),
        expect.objectContaining({
          persistent: true,
          contentType: 'application/json',
        }),
      );
    });

    it('should record success metric', () => {
      service.publishUploadCreated(sampleData);

      expect(mockMetricsService.incrementRabbitMQPublish).toHaveBeenCalledWith(
        ROUTING_KEY_UPLOAD_CREATED,
        'success',
      );
      expect(
        mockMetricsService.observeRabbitMQPublishDuration,
      ).toHaveBeenCalledWith(expect.any(Number));
    });
  });

  describe('publishUploadProcessing', () => {
    it('should publish with processing routing key', () => {
      service.publishUploadProcessing(sampleData);

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_STATUS,
        ROUTING_KEY_UPLOAD_PROCESSING,
        expect.objectContaining({ type: ROUTING_KEY_UPLOAD_PROCESSING }),
        expect.any(Object),
      );
    });
  });

  describe('publishUploadProgress', () => {
    it('should publish with progress routing key', () => {
      const progressData = { ...sampleData, progressPercent: 50 };
      service.publishUploadProgress(progressData);

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_STATUS,
        ROUTING_KEY_UPLOAD_PROGRESS,
        expect.objectContaining({
          type: ROUTING_KEY_UPLOAD_PROGRESS,
          data: expect.objectContaining({ progressPercent: 50 }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('publishUploadCompleted', () => {
    it('should publish with completed routing key', () => {
      const completedData = {
        ...sampleData,
        status: 'completed',
        completedAt: new Date().toISOString(),
        resultFilePath: '/results/123/result.xlsx',
      };
      service.publishUploadCompleted(completedData);

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_STATUS,
        ROUTING_KEY_UPLOAD_COMPLETED,
        expect.objectContaining({ type: ROUTING_KEY_UPLOAD_COMPLETED }),
        expect.any(Object),
      );
    });
  });

  describe('publishUploadCancelled', () => {
    it('should publish with cancelled routing key', () => {
      service.publishUploadCancelled({ ...sampleData, status: 'cancelled' });

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_STATUS,
        ROUTING_KEY_UPLOAD_CANCELLED,
        expect.objectContaining({ type: ROUTING_KEY_UPLOAD_CANCELLED }),
        expect.any(Object),
      );
    });
  });

  describe('publishUploadRetried', () => {
    it('should publish with retried routing key', () => {
      service.publishUploadRetried(sampleData);

      expect(mockAmqpConnection.publish).toHaveBeenCalledWith(
        EXCHANGE_NOTIFICATIONS_STATUS,
        ROUTING_KEY_UPLOAD_RETRIED,
        expect.objectContaining({ type: ROUTING_KEY_UPLOAD_RETRIED }),
        expect.any(Object),
      );
    });
  });

  describe('fire-and-forget behavior', () => {
    it('should not throw when publish fails', () => {
      mockAmqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      expect(() =>
        service.publishUploadCreated(sampleData),
      ).not.toThrow();
    });

    it('should record failure metric when publish fails', () => {
      mockAmqpConnection.publish.mockImplementation(() => {
        throw new Error('Connection lost');
      });

      service.publishUploadCreated(sampleData);

      expect(mockMetricsService.incrementRabbitMQPublish).toHaveBeenCalledWith(
        ROUTING_KEY_UPLOAD_CREATED,
        'failure',
      );
    });
  });

  describe('message envelope', () => {
    it('should include eventId, source, type, timestamp, data', () => {
      service.publishUploadCreated(sampleData);

      const publishCall = mockAmqpConnection.publish.mock.calls[0];
      const message = publishCall[2];

      expect(message.eventId).toBeDefined();
      expect(message.source).toBe('bulk-upload-service');
      expect(message.type).toBe(ROUTING_KEY_UPLOAD_CREATED);
      expect(message.timestamp).toBeDefined();
      expect(message.data).toEqual(sampleData);
    });

    it('should generate unique eventId per publish', () => {
      service.publishUploadCreated(sampleData);
      service.publishUploadCreated(sampleData);

      const id1 = mockAmqpConnection.publish.mock.calls[0][2].eventId;
      const id2 = mockAmqpConnection.publish.mock.calls[1][2].eventId;
      expect(id1).not.toBe(id2);
    });
  });
});
