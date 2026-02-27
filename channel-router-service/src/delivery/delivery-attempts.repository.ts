import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { DeliveryAttempt } from './entities/delivery-attempt.entity.js';

@Injectable()
export class DeliveryAttemptsRepository extends PgBaseRepository<DeliveryAttempt> {
  constructor(
    @InjectRepository(DeliveryAttempt)
    repository: Repository<DeliveryAttempt>,
  ) {
    super(repository);
  }

  async findByNotificationId(
    notificationId: string,
  ): Promise<DeliveryAttempt[]> {
    return this.repository.find({
      where: { notificationId },
      order: { attemptNumber: 'ASC' },
    });
  }

  async findByProviderMessageId(
    providerMessageId: string,
  ): Promise<DeliveryAttempt | null> {
    return this.repository.findOne({ where: { providerMessageId } });
  }

  async save(entity: DeliveryAttempt): Promise<DeliveryAttempt> {
    return this.repository.save(entity);
  }

  async create(data: Partial<DeliveryAttempt>): Promise<DeliveryAttempt> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }
}
