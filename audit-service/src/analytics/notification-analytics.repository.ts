import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { NotificationAnalytics } from './entities/notification-analytics.entity.js';

@Injectable()
export class NotificationAnalyticsRepository extends PgBaseRepository<NotificationAnalytics> {
  constructor(
    @InjectRepository(NotificationAnalytics)
    repository: Repository<NotificationAnalytics>,
  ) {
    super(repository);
  }
}
