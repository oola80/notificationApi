import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditEventsRepository } from '../events/audit-events.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { SearchQueryDto } from './dto/search-query.dto.js';
import { createErrorResponse } from '../common/errors.js';

const MAX_DATE_RANGE_DAYS = 90;
const OPERATOR_PATTERN = /[&|!()]/;

@Injectable()
export class SearchService {
  constructor(
    private readonly auditEventsRepository: AuditEventsRepository,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {}

  async search(query: SearchQueryDto) {
    this.validateDateRange(query.from, query.to);

    const searchMaxResults = this.configService.get<number>(
      'app.searchMaxResults',
      200,
    );

    const useRawTsquery = OPERATOR_PATTERN.test(query.q);

    const start = Date.now();

    const result = await this.auditEventsRepository.fullTextSearch({
      query: query.q,
      useRawTsquery,
      from: query.from,
      to: query.to,
      page: query.page,
      limit: query.pageSize,
    });

    const durationMs = Date.now() - start;
    this.metricsService.observeSearchDuration(durationMs);

    if (result.total > searchMaxResults) {
      throw createErrorResponse(
        'AUD-007',
        `Search returned ${result.total} results, exceeding the maximum of ${searchMaxResults}. Please refine your query.`,
      );
    }

    return {
      data: result.data,
      meta: {
        page: result.page,
        pageSize: result.limit,
        totalCount: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    };
  }

  private validateDateRange(from?: string, to?: string): void {
    if (from && to) {
      const fromDate = new Date(from);
      const toDate = new Date(to);
      const diffMs = toDate.getTime() - fromDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      if (diffDays > MAX_DATE_RANGE_DAYS) {
        throw createErrorResponse(
          'AUD-004',
          `Date range exceeds maximum of ${MAX_DATE_RANGE_DAYS} days`,
        );
      }
    }
  }
}
