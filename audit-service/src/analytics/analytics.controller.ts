import { Controller, Get, Post, Query, Body, Logger } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { AggregationService } from './aggregation.service.js';
import { QueryAnalyticsDto } from './dto/query-analytics.dto.js';
import { TriggerAggregationDto } from './dto/trigger-aggregation.dto.js';
import { createErrorResponse } from '../common/errors.js';

@Controller('audit/analytics')
export class AnalyticsController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly aggregationService: AggregationService,
  ) {}

  @Get()
  query(@Query() dto: QueryAnalyticsDto) {
    return this.analyticsService.query(dto);
  }

  @Get('summary')
  summary() {
    return this.analyticsService.summary();
  }

  @Post('aggregate')
  async aggregate(@Body() dto: TriggerAggregationDto) {
    try {
      const result = await this.aggregationService.runManualAggregation(
        dto.period,
      );
      return result;
    } catch (error) {
      this.logger.error({
        msg: 'Manual aggregation failed',
        error: (error as Error).message,
        stack: (error as Error).stack,
      });
      throw createErrorResponse(
        'AUD-010',
        `Analytics aggregation failed: ${(error as Error).message}`,
      );
    }
  }
}
