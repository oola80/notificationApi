import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { DeliveryReceipt } from './entities/delivery-receipt.entity.js';

@Injectable()
export class DeliveryReceiptsRepository extends PgBaseRepository<DeliveryReceipt> {
  constructor(
    @InjectRepository(DeliveryReceipt)
    repository: Repository<DeliveryReceipt>,
  ) {
    super(repository);
  }

  async findByNotificationIdOrdered(
    notificationId: string,
  ): Promise<DeliveryReceipt[]> {
    return this.repository.find({
      where: { notificationId },
      order: { receivedAt: 'ASC' },
    });
  }

  async findByNotificationId(
    notificationId: string,
  ): Promise<DeliveryReceipt[]> {
    return this.repository.find({
      where: { notificationId },
    });
  }
}
