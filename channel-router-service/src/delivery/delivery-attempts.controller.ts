import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { DeliveryAttemptsRepository } from './delivery-attempts.repository.js';

@Controller('delivery-attempts')
export class DeliveryAttemptsController {
  constructor(
    private readonly deliveryAttemptsRepository: DeliveryAttemptsRepository,
  ) {}

  @Get(':notificationId')
  async findByNotificationId(
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ) {
    const attempts =
      await this.deliveryAttemptsRepository.findByNotificationId(
        notificationId,
      );
    return { notificationId, attempts };
  }
}
