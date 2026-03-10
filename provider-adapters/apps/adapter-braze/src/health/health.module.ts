import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HealthController } from './health.controller.js';
import { BrazeHealthService } from './braze-health.service.js';

@Module({
  imports: [HttpModule.register({ timeout: 10000 })],
  controllers: [HealthController],
  providers: [BrazeHealthService],
  exports: [BrazeHealthService],
})
export class HealthModule {}
