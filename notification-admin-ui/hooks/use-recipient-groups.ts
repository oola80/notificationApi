"use client";

import { useApiGet, useApiMutation } from "./use-api";
import type {
  RecipientGroup,
  RecipientGroupMember,
  CreateRecipientGroupDto,
  UpdateRecipientGroupDto,
  CreateRecipientGroupMemberDto,
} from "@/types";

interface PaginatedRecipientGroupsResponse {
  data: RecipientGroup[];
  total: number;
  page: number;
  limit: number;
}

interface UseRecipientGroupsParams {
  page?: number;
  limit?: number;
  isActive?: boolean;
}

export function useRecipientGroups(params?: UseRecipientGroupsParams) {
  return useApiGet<PaginatedRecipientGroupsResponse>(
    "notificationEngine",
    "/api/v1/recipient-groups",
    {
      params: {
        page: params?.page,
        limit: params?.limit,
        isActive: params?.isActive,
      },
    },
  );
}

export function useRecipientGroup(id: string, enabled = true) {
  return useApiGet<RecipientGroup>(
    "notificationEngine",
    `/api/v1/recipient-groups/${id}`,
    { enabled },
  );
}

export function useCreateRecipientGroup() {
  return useApiMutation<RecipientGroup, CreateRecipientGroupDto>(
    "notificationEngine",
    "/api/v1/recipient-groups",
    "POST",
    [["notificationEngine", "/api/v1/recipient-groups"]],
  );
}

export function useUpdateRecipientGroup(id: string) {
  return useApiMutation<RecipientGroup, UpdateRecipientGroupDto>(
    "notificationEngine",
    `/api/v1/recipient-groups/${id}`,
    "PUT",
    [
      ["notificationEngine", `/api/v1/recipient-groups/${id}`],
      ["notificationEngine", "/api/v1/recipient-groups"],
    ],
  );
}

export function useDeleteRecipientGroup(id: string) {
  return useApiMutation<void, undefined>(
    "notificationEngine",
    `/api/v1/recipient-groups/${id}`,
    "DELETE",
    [["notificationEngine", "/api/v1/recipient-groups"]],
  );
}

export function useRecipientGroupMembers(groupId: string, enabled = true) {
  return useApiGet<RecipientGroupMember[]>(
    "notificationEngine",
    `/api/v1/recipient-groups/${groupId}/members`,
    { enabled },
  );
}

export function useAddRecipientGroupMember(groupId: string) {
  return useApiMutation<RecipientGroupMember, CreateRecipientGroupMemberDto>(
    "notificationEngine",
    `/api/v1/recipient-groups/${groupId}/members`,
    "POST",
    [
      ["notificationEngine", `/api/v1/recipient-groups/${groupId}`],
      ["notificationEngine", `/api/v1/recipient-groups/${groupId}/members`],
      ["notificationEngine", "/api/v1/recipient-groups"],
    ],
  );
}

export function useRemoveRecipientGroupMember(groupId: string, memberId: string) {
  return useApiMutation<void, undefined>(
    "notificationEngine",
    `/api/v1/recipient-groups/${groupId}/members/${memberId}`,
    "DELETE",
    [
      ["notificationEngine", `/api/v1/recipient-groups/${groupId}`],
      ["notificationEngine", `/api/v1/recipient-groups/${groupId}/members`],
      ["notificationEngine", "/api/v1/recipient-groups"],
    ],
  );
}
