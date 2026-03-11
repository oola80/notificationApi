import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryAttemptsController } from './delivery-attempts.controller.js';
import { DeliveryAttemptsRepository } from './delivery-attempts.repository.js';

describe('DeliveryAttemptsController', () => {
  let controller: DeliveryAttemptsController;
  let repository: { findByNotificationId: jest.Mock };

  beforeEach(async () => {
    repository = {
      findByNotificationId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeliveryAttemptsController],
      providers: [
        { provide: DeliveryAttemptsRepository, useValue: repository },
      ],
    }).compile();

    controller = module.get<DeliveryAttemptsController>(
      DeliveryAttemptsController,
    );
  });

  describe('GET /api/v1/delivery-attempts/:notificationId', () => {
    it('should return delivery attempts for a notification', async () => {
      const notificationId = '11111111-1111-1111-1111-111111111111';
      const attempts = [
        {
          id: '22222222-2222-2222-2222-222222222222',
          notificationId,
          correlationId: null,
          channel: 'email',
          providerId: '33333333-3333-3333-3333-333333333333',
          attemptNumber: 1,
          status: 'sent',
          providerResponse: { messageId: 'msg-123' },
          providerMessageId: 'msg-123',
          errorMessage: null,
          metadata: null,
          attemptedAt: new Date(),
          durationMs: 150,
        },
      ];

      repository.findByNotificationId.mockResolvedValue(attempts);

      const result =
        await controller.findByNotificationId(notificationId);

      expect(result).toEqual({ notificationId, attempts });
      expect(repository.findByNotificationId).toHaveBeenCalledWith(
        notificationId,
      );
    });

    it('should return empty attempts array when none found', async () => {
      const notificationId = '44444444-4444-4444-4444-444444444444';

      repository.findByNotificationId.mockResolvedValue([]);

      const result =
        await controller.findByNotificationId(notificationId);

      expect(result).toEqual({ notificationId, attempts: [] });
    });

    it('should propagate repository errors', async () => {
      const notificationId = '55555555-5555-5555-5555-555555555555';

      repository.findByNotificationId.mockRejectedValue(
        new Error('DB connection failed'),
      );

      await expect(
        controller.findByNotificationId(notificationId),
      ).rejects.toThrow('DB connection failed');
    });
  });
});
