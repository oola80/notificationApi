import { Injectable, Logger } from '@nestjs/common';
import { DlqEntriesRepository } from './dlq-entries.repository.js';
import { DlqPublisher } from '../rabbitmq/dlq-publisher.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { ListDlqQueryDto } from './dto/list-dlq-query.dto.js';
import { UpdateDlqStatusDto } from './dto/update-dlq-status.dto.js';
import { DlqEntryStatus } from './entities/dlq-entry.entity.js';
import { createErrorResponse } from '../common/errors.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  [DlqEntryStatus.PENDING]: [DlqEntryStatus.INVESTIGATED, DlqEntryStatus.DISCARDED],
  [DlqEntryStatus.INVESTIGATED]: [DlqEntryStatus.REPROCESSED, DlqEntryStatus.DISCARDED],
  [DlqEntryStatus.REPROCESSED]: [],
  [DlqEntryStatus.DISCARDED]: [],
};

const TERMINAL_STATUSES = [DlqEntryStatus.REPROCESSED, DlqEntryStatus.DISCARDED];

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    private readonly dlqEntriesRepository: DlqEntriesRepository,
    private readonly dlqPublisher: DlqPublisher,
    private readonly metricsService: MetricsService,
  ) {}

  async findAll(query: ListDlqQueryDto) {
    const result = await this.dlqEntriesRepository.findWithFilters({
      status: query.status,
      originalQueue: query.originalQueue,
      from: query.from,
      to: query.to,
      page: query.page,
      limit: query.pageSize,
    });

    const statusCounts = await this.dlqEntriesRepository.statusCounts();

    return {
      data: result.data,
      meta: {
        page: result.page,
        pageSize: result.limit,
        totalCount: result.total,
        totalPages: Math.ceil(result.total / result.limit),
        statusCounts,
      },
    };
  }

  async updateStatus(id: string, dto: UpdateDlqStatusDto) {
    const entry = await this.dlqEntriesRepository.findById(id);
    if (!entry) {
      throw createErrorResponse('AUD-003');
    }

    const targetStatus = dto.status as DlqEntryStatus;
    const allowedTargets = VALID_TRANSITIONS[entry.status] ?? [];

    if (!allowedTargets.includes(targetStatus)) {
      throw createErrorResponse(
        'AUD-006',
        `Cannot transition from '${entry.status}' to '${targetStatus}'`,
      );
    }

    const updates: Record<string, any> = {
      status: targetStatus,
    };

    if (dto.notes !== undefined) {
      updates.notes = dto.notes;
    }

    if (TERMINAL_STATUSES.includes(targetStatus)) {
      updates.resolvedAt = new Date();
      updates.resolvedBy = dto.resolvedBy ?? 'system';
    }

    await this.dlqEntriesRepository.updateEntry(id, updates);
    await this.updatePendingGauge();

    const updated = await this.dlqEntriesRepository.findById(id);
    return { data: updated };
  }

  async reprocess(id: string, resolvedBy?: string) {
    const entry = await this.dlqEntriesRepository.findById(id);
    if (!entry) {
      throw createErrorResponse('AUD-003');
    }

    if (entry.status !== DlqEntryStatus.INVESTIGATED) {
      throw createErrorResponse(
        'AUD-006',
        `DLQ entry must be in 'investigated' status to reprocess, current status: '${entry.status}'`,
      );
    }

    await this.dlqPublisher.republish(
      entry.originalExchange,
      entry.originalRoutingKey ?? '',
      entry.payload,
    );

    await this.dlqEntriesRepository.updateEntry(id, {
      status: DlqEntryStatus.REPROCESSED,
      resolvedAt: new Date(),
      resolvedBy: resolvedBy ?? 'system',
    });

    await this.updatePendingGauge();

    this.logger.log({
      msg: 'DLQ entry reprocessed',
      id,
      exchange: entry.originalExchange,
      routingKey: entry.originalRoutingKey,
    });

    return {
      data: {
        id,
        status: DlqEntryStatus.REPROCESSED,
        reprocessedTo: {
          exchange: entry.originalExchange,
          routingKey: entry.originalRoutingKey,
        },
      },
    };
  }

  private async updatePendingGauge(): Promise<void> {
    const count = await this.dlqEntriesRepository.countPending();
    this.metricsService.setDlqPendingCount(count);
  }
}
