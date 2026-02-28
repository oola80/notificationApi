export interface TimelineEntry {
  id: string;
  source: 'audit_event' | 'delivery_receipt';
  eventType: string;
  actor: string;
  timestamp: string;
  metadata: Record<string, any> | null;
  channel?: string;
  provider?: string;
  status?: string;
}

export interface NotificationTraceSummary {
  notificationId: string;
  correlationId: string | null;
  cycleId: string | null;
  channel: string | null;
  finalStatus: string | null;
  eventCount: number;
  receiptCount: number;
}

export interface NotificationTraceResponse {
  summary: NotificationTraceSummary;
  timeline: TimelineEntry[];
}

export interface CorrelationTraceResponse {
  correlationId: string;
  notifications: NotificationTraceResponse[];
}

export interface CycleTraceResponse {
  cycleId: string;
  notifications: NotificationTraceResponse[];
}
