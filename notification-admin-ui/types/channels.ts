import type { ChannelType } from "./rules";

export type RoutingMode = "primary" | "weighted" | "failover";

export interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  isActive: boolean;
  routingMode: RoutingMode;
  fallbackChannelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateChannelDto {
  routingMode?: RoutingMode;
  activeProviderId?: string;
  fallbackChannelId?: string | null;
  isActive?: boolean;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

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
  circuitBreakerState: CircuitBreakerState;
  failureCount: number;
  lastFailureAt: string | null;
  lastHealthCheck: string | null;
  configJson: Record<string, any> | null;
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
