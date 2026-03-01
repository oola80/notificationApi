import type { ChannelType } from "./rules";

export type RoutingMode = "primary" | "weighted" | "failover";

export interface ChannelConfig {
  id: string;
  channelId: string;
  configKey: string;
  configValue: string;
  createdAt: string;
  updatedAt: string;
}

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  isActive: boolean;
  routingMode: RoutingMode;
  fallbackChannelId: string | null;
  configs: ChannelConfig[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateChannelDto {
  routingMode?: RoutingMode;
  activeProviderId?: string;
  fallbackChannelId?: string | null;
  isActive?: boolean;
}

export interface Provider {
  id: string;
  providerName: string;
  providerId: string;
  channel: ChannelType;
  adapterUrl: string;
  isActive: boolean;
  routingWeight: number;
  rateLimitTokensPerSec: number | null;
  rateLimitMaxBurst: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterProviderDto {
  providerName: string;
  providerId: string;
  channel: ChannelType;
  adapterUrl: string;
  isActive?: boolean;
  routingWeight?: number;
  rateLimitTokensPerSec?: number;
  rateLimitMaxBurst?: number;
}

export interface UpdateProviderDto {
  providerName?: string;
  adapterUrl?: string;
  isActive?: boolean;
  routingWeight?: number;
  rateLimitTokensPerSec?: number;
  rateLimitMaxBurst?: number;
}
