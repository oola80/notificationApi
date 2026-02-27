import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthMonitorModule } from '../health-monitor/health-monitor.module.js';

@Module({
  imports: [HealthMonitorModule],
  controllers: [HealthController],
})
export class HealthModule {}
