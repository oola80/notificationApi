import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsService } from './metrics.service.js';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async getMetrics(@Res() response: Response): Promise<void> {
    const metrics = await this.metricsService.registry.metrics();
    response
      .set('Content-Type', 'text/plain; version=0.0.4')
      .status(200)
      .send(metrics);
  }
}
