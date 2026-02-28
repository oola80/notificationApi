import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditEventsRepository } from './audit-events.repository.js';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js';
import { createErrorResponse } from '../common/errors.js';

const MAX_DATE_RANGE_DAYS = 90;

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly auditEventsRepository: AuditEventsRepository,
    private readonly configService: ConfigService,
  ) {}

  async findAll(query: ListAuditLogsQueryDto) {
    this.validateDateRange(query.from, query.to);

    const result = await this.auditEventsRepository.findWithFilters({
      notificationId: query.notificationId,
      correlationId: query.correlationId,
      cycleId: query.cycleId,
      eventType: query.eventType,
      actor: query.actor,
      from: query.from,
      to: query.to,
      q: query.q,
      page: query.page,
      limit: query.pageSize,
    });

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
