"use client";

import * as React from "react";
import { mutate } from "swr";
import { useApiGet, useApiMutation } from "./use-api";
import { getServiceUrl } from "@/lib/service-config";
import { ApiError } from "@/lib/api-client";
import type { Upload, UploadRow, PaginatedResponse } from "@/types";

// --- List uploads ---

interface UseUploadsParams {
  page?: number;
  pageSize?: number;
  status?: string;
  uploadedBy?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function useUploads(params?: UseUploadsParams) {
  return useApiGet<PaginatedResponse<Upload>>(
    "bulkUpload",
    "/api/v1/uploads",
    {
      params: {
        page: params?.page,
        limit: params?.pageSize,
        status: params?.status || undefined,
        uploadedBy: params?.uploadedBy || undefined,
        dateFrom: params?.dateFrom || undefined,
        dateTo: params?.dateTo || undefined,
      },
    },
  );
}

// --- Single upload detail ---

export function useUpload(id: string, enabled = true) {
  return useApiGet<Upload>(
    "bulkUpload",
    `/api/v1/uploads/${id}`,
    { enabled },
  );
}

// --- Upload status (polling) ---

const POLLING_INTERVAL = parseInt(
  process.env.NEXT_PUBLIC_POLLING_INTERVAL_UPLOAD ?? "5000",
  10,
);

export function useUploadStatus(id: string, enabled = true) {
  return useApiGet<Upload>(
    "bulkUpload",
    `/api/v1/uploads/${id}/status`,
    {
      enabled,
      refreshInterval: enabled ? POLLING_INTERVAL : 0,
      revalidateOnFocus: false,
    },
  );
}

// --- Create upload (multipart/form-data) ---

interface UseCreateUploadReturn {
  trigger: (file: File, uploadedBy?: string) => Promise<Upload>;
  isMutating: boolean;
  error: Error | null;
  reset: () => void;
}

export function useCreateUpload(): UseCreateUploadReturn {
  const [isMutating, setIsMutating] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const trigger = React.useCallback(async (file: File, uploadedBy?: string): Promise<Upload> => {
    setIsMutating(true);
    setError(null);
    try {
      const baseUrl = getServiceUrl("bulkUpload");
      const formData = new FormData();
      formData.append("file", file);
      if (uploadedBy) {
        formData.append("uploadedBy", uploadedBy);
      }

      const response = await fetch(`${baseUrl}/api/v1/uploads`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let apiError: ApiError;
        try {
          const body = await response.json();
          apiError = new ApiError(
            body.code ?? "UNKNOWN",
            body.message ?? response.statusText,
            body.details ?? "",
            body.status ?? response.status,
          );
        } catch {
          apiError = new ApiError(
            "UNKNOWN",
            response.statusText || "Upload failed",
            "",
            response.status,
          );
        }
        throw apiError;
      }

      const result: Upload = await response.json();

      // Invalidate the uploads list cache
      await mutate(
        (key: unknown) =>
          Array.isArray(key) &&
          key[0] === "bulkUpload" &&
          key[1] === "/api/v1/uploads",
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
  }, []);

  const reset = React.useCallback(() => {
    setError(null);
  }, []);

  return { trigger, isMutating, error, reset };
}

// --- Retry upload ---

export function useRetryUpload(id: string) {
  return useApiMutation<Upload, undefined>(
    "bulkUpload",
    `/api/v1/uploads/${id}/retry`,
    "POST",
    [
      ["bulkUpload", `/api/v1/uploads/${id}`],
      ["bulkUpload", "/api/v1/uploads"],
    ],
  );
}

// --- Delete upload ---

export function useDeleteUpload(id: string) {
  return useApiMutation<void, undefined>(
    "bulkUpload",
    `/api/v1/uploads/${id}`,
    "DELETE",
    [["bulkUpload", "/api/v1/uploads"]],
  );
}

// --- Download result XLSX ---

interface UseDownloadResultReturn {
  trigger: () => Promise<void>;
  isDownloading: boolean;
  error: Error | null;
}

export function useDownloadResult(id: string, fileName?: string): UseDownloadResultReturn {
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const trigger = React.useCallback(async () => {
    setIsDownloading(true);
    setError(null);
    try {
      const baseUrl = getServiceUrl("bulkUpload");
      const response = await fetch(`${baseUrl}/api/v1/uploads/${id}/result`);

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName
        ? fileName.replace(/\.xlsx$/i, "") + "-result.xlsx"
        : `upload-${id}-result.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      throw e;
    } finally {
      setIsDownloading(false);
    }
  }, [id, fileName]);

  return { trigger, isDownloading, error };
}

// --- Upload errors ---

export function useUploadErrors(id: string, params?: { page?: number; pageSize?: number }) {
  return useApiGet<PaginatedResponse<UploadRow>>(
    "bulkUpload",
    `/api/v1/uploads/${id}/errors`,
    {
      params: {
        page: params?.page,
        limit: params?.pageSize,
      },
    },
  );
}
