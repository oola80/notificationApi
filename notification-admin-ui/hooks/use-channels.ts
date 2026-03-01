"use client";

import { useApiGet, useApiMutation } from "./use-api";
import type {
  Channel,
  UpdateChannelDto,
  Provider,
  RegisterProviderDto,
  UpdateProviderDto,
} from "@/types";

export function useChannels() {
  return useApiGet<Channel[]>(
    "channelRouter",
    "/api/v1/channels",
  );
}

export function useChannel(id: string, enabled = true) {
  return useApiGet<Channel>(
    "channelRouter",
    `/api/v1/channels/${id}`,
    { enabled },
  );
}

export function useUpdateChannel(id: string) {
  return useApiMutation<Channel, UpdateChannelDto>(
    "channelRouter",
    `/api/v1/channels/${id}/config`,
    "PUT",
    [
      ["channelRouter", `/api/v1/channels/${id}`],
      ["channelRouter", "/api/v1/channels"],
    ],
  );
}

export function useProviders() {
  return useApiGet<Provider[]>(
    "channelRouter",
    "/api/v1/providers",
  );
}

export function useRegisterProvider() {
  return useApiMutation<Provider, RegisterProviderDto>(
    "channelRouter",
    "/api/v1/providers/register",
    "POST",
    [["channelRouter", "/api/v1/providers"]],
  );
}

export function useUpdateProvider(id: string) {
  return useApiMutation<Provider, UpdateProviderDto>(
    "channelRouter",
    `/api/v1/providers/${id}/config`,
    "PUT",
    [
      ["channelRouter", `/api/v1/providers/${id}`],
      ["channelRouter", "/api/v1/providers"],
    ],
  );
}

export function useDeleteProvider(id: string) {
  return useApiMutation<void, undefined>(
    "channelRouter",
    `/api/v1/providers/${id}`,
    "DELETE",
    [["channelRouter", "/api/v1/providers"]],
  );
}
