import type { ChannelType } from "./rules";

export interface StatusTransition {
  from: string | null;
  to: string;
  reason: string | null;
  timestamp: string;
}

export interface DeliveryAttempt {
  id: string;
  provider: string;
  status: string;
  responseCode: string | null;
  responseMessage: string | null;
  attemptedAt: string;
}

export interface Notification {
  id: string;
  eventId: string;
  ruleId: string;
  templateId: string;
  status: string;
  channel: ChannelType;
  recipient: string;
  renderedContent: Record<string, unknown> | null;
  statusLog: StatusTransition[];
  deliveryAttempts: DeliveryAttempt[];
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTimeline {
  notificationId: string;
  events: TimelineEvent[];
}

export interface TimelineEvent {
  eventType: string;
  actor: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// --- Audit-service trace response types ---

export interface TraceSummary {
  notificationId: string;
  correlationId: string | null;
  cycleId: string | null;
  channel: string | null;
  finalStatus: string | null;
  eventCount: number;
  receiptCount: number;
}

export interface TraceTimelineEntry {
  id: string;
  source: "audit_event" | "delivery_receipt";
  eventType: string;
  actor: string;
  timestamp: string;
  metadata: Record<string, unknown> | null;
  channel?: string;
  provider?: string;
  status?: string;
}

export interface NotificationTraceResponse {
  summary: TraceSummary;
  timeline: TraceTimelineEntry[];
}

export interface CorrelationTraceResponse {
  correlationId: string;
  notifications: NotificationTraceResponse[];
}

export interface CycleTraceResponse {
  cycleId: string;
  notifications: NotificationTraceResponse[];
}

// --- Audit-service receipts response ---

export interface DeliveryReceipt {
  id: string;
  notificationId: string | null;
  correlationId: string | null;
  cycleId: string | null;
  channel: string;
  provider: string;
  status: string;
  providerMessageId: string | null;
  rawResponse: Record<string, unknown> | null;
  receivedAt: string;
}

export interface ReceiptsResponse {
  notificationId: string;
  receipts: DeliveryReceipt[];
}

// --- Audit-service logs response (meta-based pagination) ---

export interface AuditLogsMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export interface AuditLogsResponse {
  data: import("./audit").AuditEvent[];
  meta: AuditLogsMeta;
}
