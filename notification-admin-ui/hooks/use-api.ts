"use client";

import * as React from "react";
import useSWR, { type SWRConfiguration } from "swr";
import { mutate } from "swr";
import { apiClient, swrFetcher } from "@/lib/api-client";
import type { ServiceName } from "@/lib/service-config";

// --- GET hook ---

interface UseApiGetOptions extends SWRConfiguration {
  params?: Record<string, string | number | boolean | undefined | null>;
  enabled?: boolean;
}

function useApiGet<T>(
  service: ServiceName,
  path: string,
  options?: UseApiGetOptions,
) {
  const { params, enabled = true, ...swrOptions } = options ?? {};
  const key = enabled ? ([service, path, params] as const) : null;

  return useSWR<T>(
    key as [ServiceName, string, Record<string, string | number | boolean | undefined | null>?] | null,
    swrFetcher as (key: [ServiceName, string, Record<string, string | number | boolean | undefined | null>?]) => Promise<T>,
    swrOptions,
  );
}

// --- Mutation hook ---

type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";

interface UseApiMutationReturn<TData, TBody> {
  trigger: (body?: TBody) => Promise<TData>;
  isMutating: boolean;
  error: Error | null;
  reset: () => void;
}

function useApiMutation<TData = unknown, TBody = unknown>(
  service: ServiceName,
  path: string,
  method: MutationMethod = "POST",
  invalidateKeys?: (string | [ServiceName, string, ...unknown[]])[],
): UseApiMutationReturn<TData, TBody> {
  const [isMutating, setIsMutating] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const trigger = React.useCallback(
    async (body?: TBody): Promise<TData> => {
      setIsMutating(true);
      setError(null);
      try {
        let result: TData;
        switch (method) {
          case "POST":
            result = await apiClient.post<TData>(service, path, body);
            break;
          case "PUT":
            result = await apiClient.put<TData>(service, path, body);
            break;
          case "PATCH":
            result = await apiClient.patch<TData>(service, path, body);
            break;
          case "DELETE":
            result = await apiClient.delete<TData>(service, path);
            break;
        }
        // Invalidate related SWR caches
        if (invalidateKeys) {
          await Promise.all(invalidateKeys.map((key) => mutate(key)));
        }
        return result;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setIsMutating(false);
      }
    },
    [service, path, method, invalidateKeys],
  );

  const reset = React.useCallback(() => {
    setError(null);
  }, []);

  return { trigger, isMutating, error, reset };
}

export { useApiGet, useApiMutation };
export type { UseApiGetOptions, UseApiMutationReturn };
