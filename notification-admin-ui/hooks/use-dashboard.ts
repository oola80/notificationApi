"use client";

import { useApiGet } from "./use-api";
import type { DashboardSummary, AnalyticsResponse, AnalyticsQueryParams } from "@/types";

const POLLING_INTERVAL = parseInt(
  process.env.NEXT_PUBLIC_POLLING_INTERVAL_DASHBOARD ?? "30000",
  10,
);

export function useDashboardSummary() {
  return useApiGet<DashboardSummary>(
    "audit",
    "/api/v1/audit/analytics/summary",
    { refreshInterval: POLLING_INTERVAL },
  );
}

export function useAnalytics(params?: AnalyticsQueryParams) {
  return useApiGet<AnalyticsResponse>(
    "audit",
    "/api/v1/audit/analytics",
    {
      params: {
        period: params?.period || undefined,
        from: params?.from || undefined,
        to: params?.to || undefined,
        channel: params?.channel || undefined,
        eventType: params?.eventType || undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      },
      enabled: !!params?.from && !!params?.to,
    },
  );
}
