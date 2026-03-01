"use client";

import { useApiGet, useApiMutation } from "./use-api";
import type {
  EventMapping,
  CreateMappingDto,
  UpdateMappingDto,
  TestMappingPayload,
  TestMappingResult,
  PaginatedResponse,
} from "@/types";

interface UseMappingsParams {
  page?: number;
  limit?: number;
  sourceId?: string;
  eventType?: string;
  isActive?: boolean;
}

export function useMappings(params?: UseMappingsParams) {
  return useApiGet<PaginatedResponse<EventMapping>>(
    "eventIngestion",
    "/api/v1/event-mappings",
    {
      params: {
        page: params?.page,
        limit: params?.limit,
        sourceId: params?.sourceId || undefined,
        eventType: params?.eventType || undefined,
        isActive: params?.isActive,
      },
    },
  );
}

export function useMapping(id: string, enabled = true) {
  return useApiGet<EventMapping>(
    "eventIngestion",
    `/api/v1/event-mappings/${id}`,
    { enabled },
  );
}

export function useCreateMapping() {
  return useApiMutation<EventMapping, CreateMappingDto>(
    "eventIngestion",
    "/api/v1/event-mappings",
    "POST",
    [["eventIngestion", "/api/v1/event-mappings"]],
  );
}

export function useUpdateMapping(id: string) {
  return useApiMutation<EventMapping, UpdateMappingDto>(
    "eventIngestion",
    `/api/v1/event-mappings/${id}`,
    "PUT",
    [
      ["eventIngestion", `/api/v1/event-mappings/${id}`],
      ["eventIngestion", "/api/v1/event-mappings"],
    ],
  );
}

export function useDeleteMapping(id: string) {
  return useApiMutation<void, undefined>(
    "eventIngestion",
    `/api/v1/event-mappings/${id}`,
    "DELETE",
    [["eventIngestion", "/api/v1/event-mappings"]],
  );
}

export function useTestMapping(id: string) {
  return useApiMutation<TestMappingResult, TestMappingPayload>(
    "eventIngestion",
    `/api/v1/event-mappings/${id}/test`,
    "POST",
  );
}
