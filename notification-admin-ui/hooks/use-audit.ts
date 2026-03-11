"use client";

import * as React from "react";
import { mutate } from "swr";
import { useApiGet, useApiMutation } from "./use-api";
import { apiClient } from "@/lib/api-client";
import { getServiceUrl } from "@/lib/service-config";
import type {
  AuditEvent,
  AuditSearchParams,
  AuditLogsResponse,
  DlqListResponse,
  DlqSearchParams,
  DlqEntry,
  UpdateDlqStatusDto,
  ReprocessDlqResponse,
} from "@/types";

// --- Audit Logs ---

export function useAuditLogs(params?: AuditSearchParams) {
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

// --- Audit Search ---

export function useAuditSearch(
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

// --- DLQ Entries ---

export function useDlqEntries(params?: DlqSearchParams) {
  return useApiGet<DlqListResponse>(
    "audit",
    "/api/v1/audit/dlq",
    {
      params: {
        status: params?.status || undefined,
        originalQueue: params?.originalQueue || undefined,
        from: params?.from || undefined,
        to: params?.to || undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      },
    },
  );
}

// --- Update DLQ Status ---

interface UseUpdateDlqStatusReturn {
  trigger: (id: string, body: UpdateDlqStatusDto) => Promise<DlqEntry>;
  isMutating: boolean;
  error: Error | null;
  reset: () => void;
}

export function useUpdateDlqStatus(): UseUpdateDlqStatusReturn {
  const [isMutating, setIsMutating] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const trigger = React.useCallback(
    async (id: string, body: UpdateDlqStatusDto): Promise<DlqEntry> => {
      setIsMutating(true);
      setError(null);
      try {
        const result = await apiClient.patch<{ data: DlqEntry }>(
          "audit",
          `/api/v1/audit/dlq/${id}`,
          body,
        );
        await mutate(
          (key: unknown) =>
            Array.isArray(key) &&
            key[0] === "audit" &&
            key[1] === "/api/v1/audit/dlq",
          undefined,
          { revalidate: true },
        );
        return result.data;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const reset = React.useCallback(() => {
    setError(null);
  }, []);

  return { trigger, isMutating, error, reset };
}

// --- Reprocess DLQ ---

interface UseReprocessDlqReturn {
  trigger: (id: string, resolvedBy?: string) => Promise<ReprocessDlqResponse>;
  isMutating: boolean;
  error: Error | null;
  reset: () => void;
}

export function useReprocessDlq(): UseReprocessDlqReturn {
  const [isMutating, setIsMutating] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const trigger = React.useCallback(
    async (id: string, resolvedBy?: string): Promise<ReprocessDlqResponse> => {
      setIsMutating(true);
      setError(null);
      try {
        const body = resolvedBy ? { resolvedBy } : undefined;
        const result = await apiClient.post<ReprocessDlqResponse>(
          "audit",
          `/api/v1/audit/dlq/${id}/reprocess`,
          body,
        );
        await mutate(
          (key: unknown) =>
            Array.isArray(key) &&
            key[0] === "audit" &&
            key[1] === "/api/v1/audit/dlq",
          undefined,
          { revalidate: true },
        );
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsMutating(false);
      }
    },
    [],
  );

  const reset = React.useCallback(() => {
    setError(null);
  }, []);

  return { trigger, isMutating, error, reset };
}

// --- XLSX Export (server-side) ---

interface UseXlsxExportReturn {
  trigger: (params?: AuditSearchParams) => Promise<void>;
  isExporting: boolean;
  error: Error | null;
}

export function useXlsxExport(): UseXlsxExportReturn {
  const [isExporting, setIsExporting] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const trigger = React.useCallback(
    async (params?: AuditSearchParams) => {
      if (!params?.from || !params?.to) {
        throw new Error("Date range (from/to) is required for XLSX export");
      }

      setIsExporting(true);
      setError(null);
      try {
        const baseUrl = getServiceUrl("audit");
        const queryParams = new URLSearchParams();
        queryParams.set("from", params.from);
        queryParams.set("to", params.to);
        if (params.notificationId) queryParams.set("notificationId", params.notificationId);
        if (params.correlationId) queryParams.set("correlationId", params.correlationId);
        if (params.cycleId) queryParams.set("cycleId", params.cycleId);
        if (params.eventType) queryParams.set("eventType", params.eventType);
        if (params.actor) queryParams.set("actor", params.actor);
        if (params.q) queryParams.set("q", params.q);

        const url = `${baseUrl}/api/v1/audit/logs/export?${queryParams.toString()}`;
        const response = await fetch(url);

        if (!response.ok) {
          const errorBody = await response.json().catch(() => null);
          const message = errorBody?.message ?? `Export failed (${response.status})`;
          throw new Error(message);
        }

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = blobUrl;
        anchor.download = `audit-export-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.xlsx`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(blobUrl);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsExporting(false);
      }
    },
    [],
  );

  return { trigger, isExporting, error };
}

// --- CSV Export (fetch all pages) ---

interface UseCsvExportReturn {
  trigger: (params?: AuditSearchParams) => Promise<void>;
  isExporting: boolean;
  error: Error | null;
}

export function useCsvExport(): UseCsvExportReturn {
  const [isExporting, setIsExporting] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const trigger = React.useCallback(
    async (params?: AuditSearchParams) => {
      setIsExporting(true);
      setError(null);
      try {
        const allData: AuditEvent[] = [];
        let currentPage = 1;
        const pageSize = 200;
        let totalPages = 1;

        while (currentPage <= totalPages) {
          const queryParams: Record<string, string | number | boolean | undefined | null> = {
            ...params,
            page: currentPage,
            pageSize,
          };
          // Remove empty string values
          for (const key of Object.keys(queryParams)) {
            if (queryParams[key] === "" || queryParams[key] === undefined) {
              delete queryParams[key];
            }
          }

          const result = await apiClient.get<AuditLogsResponse>(
            "audit",
            "/api/v1/audit/logs",
            { params: queryParams },
          );

          allData.push(...result.data);
          totalPages = result.meta.totalPages;
          currentPage++;
        }

        // Generate CSV
        if (allData.length === 0) {
          throw new Error("No data to export");
        }

        const headers = [
          "ID",
          "Notification ID",
          "Correlation ID",
          "Cycle ID",
          "Event Type",
          "Actor",
          "Created At",
        ];

        const csvRows = [headers.join(",")];
        for (const row of allData) {
          const values = [
            row.id,
            row.notificationId ?? "",
            row.correlationId ?? "",
            row.cycleId ?? "",
            row.eventType,
            row.actor,
            row.createdAt,
          ].map((v) => `"${String(v).replace(/"/g, '""')}"`);
          csvRows.push(values.join(","));
        }

        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `audit-export-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, "-")}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsExporting(false);
      }
    },
    [],
  );

  return { trigger, isExporting, error };
}
