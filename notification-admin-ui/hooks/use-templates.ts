"use client";

import { useApiGet, useApiMutation } from "./use-api";
import type {
  Template,
  CreateTemplateDto,
  UpdateTemplateDto,
  PreviewResult,
  RenderResponse,
} from "@/types";

interface PaginatedTemplatesResponse {
  data: Template[];
  total: number;
  page: number;
  limit: number;
}

interface UseTemplatesParams {
  page?: number;
  limit?: number;
  channel?: string;
  isActive?: boolean;
  search?: string;
}

export function useTemplates(params?: UseTemplatesParams) {
  return useApiGet<PaginatedTemplatesResponse>(
    "template",
    "/api/v1/templates",
    {
      params: {
        page: params?.page,
        limit: params?.limit,
        channel: params?.channel || undefined,
        isActive: params?.isActive,
        search: params?.search || undefined,
      },
    },
  );
}

export function useTemplate(id: string, enabled = true) {
  return useApiGet<Template>(
    "template",
    `/api/v1/templates/${id}`,
    { enabled },
  );
}

export function useCreateTemplate() {
  return useApiMutation<Template, CreateTemplateDto>(
    "template",
    "/api/v1/templates",
    "POST",
    [["template", "/api/v1/templates"]],
  );
}

export function useUpdateTemplate(id: string) {
  return useApiMutation<Template, UpdateTemplateDto>(
    "template",
    `/api/v1/templates/${id}`,
    "PUT",
    [
      ["template", `/api/v1/templates/${id}`],
      ["template", "/api/v1/templates"],
    ],
  );
}

export function useDeleteTemplate(id: string) {
  return useApiMutation<void, undefined>(
    "template",
    `/api/v1/templates/${id}`,
    "DELETE",
    [["template", "/api/v1/templates"]],
  );
}

export function useRenderTemplate(id: string) {
  return useApiMutation<RenderResponse, { channel: string; data: Record<string, string> }>(
    "template",
    `/api/v1/templates/${id}/render`,
    "POST",
  );
}

export function usePreviewTemplate(id: string) {
  return useApiMutation<PreviewResult, { data: Record<string, string> }>(
    "template",
    `/api/v1/templates/${id}/preview`,
    "POST",
  );
}

export function useRollbackTemplate(id: string) {
  return useApiMutation<Template, { versionNumber: number }>(
    "template",
    `/api/v1/templates/${id}/rollback`,
    "POST",
    [
      ["template", `/api/v1/templates/${id}`],
      ["template", "/api/v1/templates"],
    ],
  );
}
