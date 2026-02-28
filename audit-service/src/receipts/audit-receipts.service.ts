import { Injectable } from '@nestjs/common';
import { DeliveryReceiptsRepository } from './delivery-receipts.repository.js';
import { createErrorResponse } from '../common/errors.js';

@Injectable()
export class AuditReceiptsService {
  constructor(
    private readonly deliveryReceiptsRepository: DeliveryReceiptsRepository,
  ) {}

  async getReceiptsByNotificationId(notificationId: string) {
    const receipts =
      await this.deliveryReceiptsRepository.findByNotificationId(
        notificationId,
      );

    if (receipts.length === 0) {
      throw createErrorResponse('AUD-008');
    }

    return {
      notificationId,
      receipts,
    };
  }
}
