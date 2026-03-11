"use client";

import { useApiGet } from "./use-api";
import type { AuditSearchParams } from "@/types";
import type {
  AuditLogsResponse,
  NotificationTraceResponse,
  CorrelationTraceResponse,
  CycleTraceResponse,
  ReceiptsResponse,
  DeliveryAttemptsResponse,
} from "@/types";

export function useNotificationLogs(params?: AuditSearchParams) {
  return useApiGet<AuditLogsResponse>(
    "audit",
    "/api/v1/audit/logs",
    {
      params: {
        notificationId: params?.notificationId || undefined,
        correlationId: params?.correlationId || undefined,
        cycleId: params?.cycleId || undefined,
        eventType: params?.eventType || undefined,
        actor: params?.actor || undefined,
        from: params?.from || undefined,
        to: params?.to || undefined,
        q: params?.q || undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      },
    },
  );
}

export function useNotificationSearch(
  query: string,
  params?: { from?: string; to?: string; page?: number; pageSize?: number },
) {
  return useApiGet<AuditLogsResponse>(
    "audit",
    "/api/v1/audit/search",
    {
      params: {
        q: query || undefined,
        from: params?.from || undefined,
        to: params?.to || undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      },
      enabled: !!query,
    },
  );
}

export function useNotificationTrace(notificationId: string, enabled = true) {
  return useApiGet<NotificationTraceResponse>(
    "audit",
    `/api/v1/audit/trace/${notificationId}`,
    { enabled: enabled && !!notificationId },
  );
}

export function useCorrelationTrace(correlationId: string, enabled = true) {
  return useApiGet<CorrelationTraceResponse>(
    "audit",
    `/api/v1/audit/trace/correlation/${correlationId}`,
    { enabled: enabled && !!correlationId },
  );
}

export function useCycleTrace(cycleId: string, enabled = true) {
  return useApiGet<CycleTraceResponse>(
    "audit",
    `/api/v1/audit/trace/cycle/${cycleId}`,
    { enabled: enabled && !!cycleId },
  );
}

export function useDeliveryReceipts(notificationId: string, enabled = true) {
  return useApiGet<ReceiptsResponse>(
    "audit",
    `/api/v1/audit/receipts/${notificationId}`,
    {
      enabled: enabled && !!notificationId,
      onErrorRetry: () => {},
      onError: () => {},
    },
  );
}

export function useProviderDeliveryAttempts(notificationId: string, enabled = true) {
  return useApiGet<DeliveryAttemptsResponse>(
    "channelRouter",
    `/api/v1/delivery-attempts/${notificationId}`,
    {
      enabled: enabled && !!notificationId,
      onErrorRetry: () => {},
      onError: () => {},
    },
  );
}
