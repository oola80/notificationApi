import { AuditReceiptsController } from './audit-receipts.controller';
import { AuditReceiptsService } from './audit-receipts.service';

describe('AuditReceiptsController', () => {
  let controller: AuditReceiptsController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      getReceiptsByNotificationId: jest.fn().mockResolvedValue({
        notificationId: 'n-1',
        receipts: [],
      }),
    };

    controller = new AuditReceiptsController(
      mockService as unknown as AuditReceiptsService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /audit/receipts/:notificationId', () => {
    it('should delegate to service.getReceiptsByNotificationId', async () => {
      await controller.getReceipts('n-123');

      expect(mockService.getReceiptsByNotificationId).toHaveBeenCalledWith(
        'n-123',
      );
    });

    it('should return the service response', async () => {
      const expected = {
        notificationId: 'n-123',
        receipts: [{ id: 'rc-1' }],
      };
      mockService.getReceiptsByNotificationId.mockResolvedValue(expected);

      const result = await controller.getReceipts('n-123');

      expect(result).toBe(expected);
    });
  });
});
