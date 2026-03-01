export interface AuditEvent {
  id: string;
  notificationId: string | null;
  correlationId: string | null;
  cycleId: string | null;
  eventType: string;
  actor: string;
  metadata: Record<string, unknown> | null;
  payloadSnapshot: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditSearchParams {
  notificationId?: string;
  correlationId?: string;
  cycleId?: string;
  eventType?: string;
  actor?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export type DlqStatus = "pending" | "investigated" | "reprocessed" | "discarded";

export interface DlqEntry {
  id: string;
  originalQueue: string;
  originalExchange: string;
  originalRoutingKey: string | null;
  rejectionReason: string | null;
  retryCount: number;
  payload: Record<string, unknown>;
  xDeathHeaders: Record<string, unknown> | null;
  status: DlqStatus;
  notes: string | null;
  capturedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface DlqStatusCounts {
  pending: number;
  investigated: number;
  reprocessed: number;
  discarded: number;
}

export interface DlqListMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  statusCounts: DlqStatusCounts;
}

export interface DlqListResponse {
  data: DlqEntry[];
  meta: DlqListMeta;
}

export interface DlqSearchParams {
  status?: DlqStatus;
  originalQueue?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface UpdateDlqStatusDto {
  status: "investigated" | "reprocessed" | "discarded";
  notes?: string;
  resolvedBy?: string;
}

export interface ReprocessDlqDto {
  resolvedBy?: string;
}

export interface ReprocessDlqResponse {
  data: {
    id: string;
    status: "reprocessed";
    reprocessedTo: {
      exchange: string;
      routingKey: string;
    };
  };
}

/** Allowed DLQ status transitions */
export const DLQ_TRANSITIONS: Record<DlqStatus, DlqStatus[]> = {
  pending: ["investigated", "discarded"],
  investigated: ["reprocessed", "discarded"],
  reprocessed: [],
  discarded: [],
};
