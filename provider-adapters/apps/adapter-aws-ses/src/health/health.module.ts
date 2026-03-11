import { Module } from '@nestjs/common';
import { SesClientModule } from '../ses-client/ses-client.module.js';
import { HealthController } from './health.controller.js';
import { SesHealthService } from './ses-health.service.js';

@Module({
  imports: [SesClientModule],
  controllers: [HealthController],
  providers: [SesHealthService],
  exports: [SesHealthService],
})
export class HealthModule {}
