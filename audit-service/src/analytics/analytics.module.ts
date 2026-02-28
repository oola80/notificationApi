import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationAnalytics } from './entities/notification-analytics.entity.js';
import { NotificationAnalyticsRepository } from './notification-analytics.repository.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';
import { AggregationService } from './aggregation.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationAnalytics]),
    ScheduleModule.forRoot(),
  ],
  controllers: [AnalyticsController],
  providers: [
    NotificationAnalyticsRepository,
    AnalyticsService,
    AggregationService,
  ],
  exports: [NotificationAnalyticsRepository],
})
export class AnalyticsModule {}
