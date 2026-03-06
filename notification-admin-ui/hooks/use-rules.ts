"use client";

import { useApiGet, useApiMutation } from "./use-api";
import type {
  Rule,
  CreateRuleDto,
  UpdateRuleDto,
} from "@/types";

interface PaginatedRulesResponse {
  data: Rule[];
  total: number;
  page: number;
  limit: number;
}

interface UseRulesParams {
  page?: number;
  limit?: number;
  eventType?: string;
  isActive?: boolean;
}

export function useRules(params?: UseRulesParams) {
  return useApiGet<PaginatedRulesResponse>(
    "notificationEngine",
    "/api/v1/rules",
    {
      params: {
        page: params?.page,
        limit: params?.limit,
        eventType: params?.eventType || undefined,
        isActive: params?.isActive,
      },
    },
  );
}

export function useRule(id: string, enabled = true) {
  return useApiGet<Rule>(
    "notificationEngine",
    `/api/v1/rules/${id}`,
    { enabled },
  );
}

export function useCreateRule() {
  return useApiMutation<Rule, CreateRuleDto>(
    "notificationEngine",
    "/api/v1/rules",
    "POST",
    [["notificationEngine", "/api/v1/rules"]],
  );
}

export function useUpdateRule(id: string) {
  return useApiMutation<Rule, UpdateRuleDto>(
    "notificationEngine",
    `/api/v1/rules/${id}`,
    "PUT",
    [
      ["notificationEngine", `/api/v1/rules/${id}`],
      ["notificationEngine", "/api/v1/rules"],
    ],
  );
}

export function useDeleteRule(id: string) {
  return useApiMutation<void, undefined>(
    "notificationEngine",
    `/api/v1/rules/${id}`,
    "DELETE",
    [["notificationEngine", "/api/v1/rules"]],
  );
}
