import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service.js';
import { QueryAnalyticsDto } from './dto/query-analytics.dto.js';

@Controller('audit/analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  query(@Query() dto: QueryAnalyticsDto) {
    return this.analyticsService.query(dto);
  }

  @Get('summary')
  summary() {
    return this.analyticsService.summary();
  }
}
