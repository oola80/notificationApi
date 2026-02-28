import { Injectable } from '@nestjs/common';
import { AuditEventsRepository } from '../events/audit-events.repository.js';
import { DeliveryReceiptsRepository } from '../receipts/delivery-receipts.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { createErrorResponse } from '../common/errors.js';
import {
  TimelineEntry,
  NotificationTraceResponse,
  NotificationTraceSummary,
  CorrelationTraceResponse,
  CycleTraceResponse,
} from './interfaces/trace-response.interface.js';
import { AuditEvent } from '../events/entities/audit-event.entity.js';
import { DeliveryReceipt } from '../receipts/entities/delivery-receipt.entity.js';

@Injectable()
export class TraceService {
  constructor(
    private readonly auditEventsRepository: AuditEventsRepository,
    private readonly deliveryReceiptsRepository: DeliveryReceiptsRepository,
    private readonly metricsService: MetricsService,
  ) {}

  async traceByNotificationId(
    notificationId: string,
  ): Promise<NotificationTraceResponse> {
    const start = Date.now();

    const [events, receipts] = await Promise.all([
      this.auditEventsRepository.findByNotificationIdOrdered(notificationId),
      this.deliveryReceiptsRepository.findByNotificationIdOrdered(
        notificationId,
      ),
    ]);

    if (events.length === 0 && receipts.length === 0) {
      throw createErrorResponse('AUD-008');
    }

    const timeline = this.mergeTimeline(events, receipts);
    const summary = this.buildSummary(
      notificationId,
      events,
      receipts,
      timeline,
    );

    const durationMs = Date.now() - start;
    this.metricsService.observeTraceDuration(durationMs);

    return { summary, timeline };
  }

  async traceByCorrelationId(
    correlationId: string,
  ): Promise<CorrelationTraceResponse> {
    const start = Date.now();

    const notificationIds =
      await this.auditEventsRepository.findDistinctNotificationIds(
        'correlationId',
        correlationId,
      );

    if (notificationIds.length === 0) {
      throw createErrorResponse('AUD-008');
    }

    const notifications = await Promise.all(
      notificationIds.map((id) => this.traceByNotificationId(id)),
    );

    const durationMs = Date.now() - start;
    this.metricsService.observeTraceDuration(durationMs);

    return { correlationId, notifications };
  }

  async traceByCycleId(cycleId: string): Promise<CycleTraceResponse> {
    const start = Date.now();

    const notificationIds =
      await this.auditEventsRepository.findDistinctNotificationIds(
        'cycleId',
        cycleId,
      );

    if (notificationIds.length === 0) {
      throw createErrorResponse('AUD-008');
    }

    const notifications = await Promise.all(
      notificationIds.map((id) => this.traceByNotificationId(id)),
    );

    const durationMs = Date.now() - start;
    this.metricsService.observeTraceDuration(durationMs);

    return { cycleId, notifications };
  }

  private mergeTimeline(
    events: AuditEvent[],
    receipts: DeliveryReceipt[],
  ): TimelineEntry[] {
    const timeline: TimelineEntry[] = [];

    for (const event of events) {
      timeline.push({
        id: event.id,
        source: 'audit_event',
        eventType: event.eventType,
        actor: event.actor,
        timestamp: event.createdAt.toISOString(),
        metadata: event.metadata,
      });
    }

    for (const receipt of receipts) {
      timeline.push({
        id: receipt.id,
        source: 'delivery_receipt',
        eventType: `RECEIPT_${receipt.status.toUpperCase()}`,
        actor: receipt.provider,
        timestamp: receipt.receivedAt.toISOString(),
        metadata: null,
        channel: receipt.channel,
        provider: receipt.provider,
        status: receipt.status,
      });
    }

    timeline.sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    return timeline;
  }

  private buildSummary(
    notificationId: string,
    events: AuditEvent[],
    receipts: DeliveryReceipt[],
    timeline: TimelineEntry[],
  ): NotificationTraceSummary {
    const earliest = events[0];
    const correlationId = earliest?.correlationId ?? null;
    const cycleId = earliest?.cycleId ?? null;

    const channel = this.extractChannel(events, receipts);
    const finalStatus = this.extractFinalStatus(timeline);

    return {
      notificationId,
      correlationId,
      cycleId,
      channel,
      finalStatus,
      eventCount: events.length,
      receiptCount: receipts.length,
    };
  }

  private extractChannel(
    events: AuditEvent[],
    receipts: DeliveryReceipt[],
  ): string | null {
    for (const event of events) {
      if (event.metadata?.channel) {
        return event.metadata.channel as string;
      }
    }

    if (receipts.length > 0) {
      return receipts[0].channel;
    }

    return null;
  }

  private extractFinalStatus(timeline: TimelineEntry[]): string | null {
    if (timeline.length === 0) return null;
    const last = timeline[timeline.length - 1];
    return last.eventType;
  }
}
