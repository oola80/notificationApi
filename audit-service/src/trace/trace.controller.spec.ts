import { TraceController } from './trace.controller';
import { TraceService } from './trace.service';

describe('TraceController', () => {
  let controller: TraceController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      traceByNotificationId: jest.fn().mockResolvedValue({
        summary: { notificationId: 'n-1' },
        timeline: [],
      }),
      traceByCorrelationId: jest.fn().mockResolvedValue({
        correlationId: 'c-1',
        notifications: [],
      }),
      traceByCycleId: jest.fn().mockResolvedValue({
        cycleId: 'cy-1',
        notifications: [],
      }),
    };

    controller = new TraceController(
      mockService as unknown as TraceService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /audit/trace/:notificationId', () => {
    it('should delegate to service.traceByNotificationId', async () => {
      await controller.traceByNotificationId('n-1');

      expect(mockService.traceByNotificationId).toHaveBeenCalledWith('n-1');
    });
  });

  describe('GET /audit/trace/correlation/:correlationId', () => {
    it('should delegate to service.traceByCorrelationId', async () => {
      await controller.traceByCorrelationId('c-123');

      expect(mockService.traceByCorrelationId).toHaveBeenCalledWith('c-123');
    });
  });

  describe('GET /audit/trace/cycle/:cycleId', () => {
    it('should delegate to service.traceByCycleId', async () => {
      await controller.traceByCycleId('cy-456');

      expect(mockService.traceByCycleId).toHaveBeenCalledWith('cy-456');
    });
  });
});
