import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { RenderingModule } from '../rendering/rendering.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule, RenderingModule],
  controllers: [HealthController],
})
export class HealthModule {}
