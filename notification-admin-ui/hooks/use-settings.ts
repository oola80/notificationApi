"use client";

import { useApiGet, useApiMutation } from "./use-api";
import type { SystemConfig, UpdateSystemConfigDto } from "@/types";

export function useSystemConfigs() {
  return useApiGet<SystemConfig[]>(
    "admin",
    "/api/v1/system-configs",
  );
}

export function useUpdateSystemConfig(key: string) {
  return useApiMutation<SystemConfig, UpdateSystemConfigDto>(
    "admin",
    `/api/v1/system-configs/${encodeURIComponent(key)}`,
    "PUT",
    [["admin", "/api/v1/system-configs"]],
  );
}
