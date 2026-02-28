import { AuditReceiptsService } from './audit-receipts.service';
import { DeliveryReceiptsRepository } from './delivery-receipts.repository';
import { DeliveryReceipt } from './entities/delivery-receipt.entity';
import { HttpException } from '@nestjs/common';

describe('AuditReceiptsService', () => {
  let service: AuditReceiptsService;
  let mockRepository: any;

  beforeEach(() => {
    mockRepository = {
      findByNotificationId: jest.fn().mockResolvedValue([]),
    };

    service = new AuditReceiptsService(
      mockRepository as unknown as DeliveryReceiptsRepository,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getReceiptsByNotificationId', () => {
    it('should return receipts for a notification', async () => {
      const receipt = new DeliveryReceipt();
      receipt.id = 'rc-1';
      receipt.channel = 'email';
      receipt.provider = 'mailgun';
      receipt.status = 'delivered';
      mockRepository.findByNotificationId.mockResolvedValue([receipt]);

      const result =
        await service.getReceiptsByNotificationId('n-123');

      expect(result.notificationId).toBe('n-123');
      expect(result.receipts).toHaveLength(1);
      expect(result.receipts[0]).toBe(receipt);
    });

    it('should throw AUD-008 when no receipts found', async () => {
      mockRepository.findByNotificationId.mockResolvedValue([]);

      await expect(
        service.getReceiptsByNotificationId('nonexistent'),
      ).rejects.toThrow(HttpException);

      try {
        await service.getReceiptsByNotificationId('nonexistent');
      } catch (e: any) {
        expect(e.getResponse().code).toBe('AUD-008');
      }
    });

    it('should return multiple receipts', async () => {
      const receipts = [
        new DeliveryReceipt(),
        new DeliveryReceipt(),
        new DeliveryReceipt(),
      ];
      mockRepository.findByNotificationId.mockResolvedValue(receipts);

      const result =
        await service.getReceiptsByNotificationId('n-123');

      expect(result.receipts).toHaveLength(3);
    });
  });
});
