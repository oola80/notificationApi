import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationAnalytics } from './entities/notification-analytics.entity.js';
import { NotificationAnalyticsRepository } from './notification-analytics.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationAnalytics])],
  providers: [NotificationAnalyticsRepository],
  exports: [NotificationAnalyticsRepository],
})
export class AnalyticsModule {}
