import { z } from "zod";

export const CHANNEL_TYPES = ["email", "sms", "whatsapp", "push"] as const;
export const ROUTING_MODES = ["primary", "weighted", "failover"] as const;

export const updateChannelSchema = z.object({
  isActive: z.boolean(),
  routingMode: z.enum(ROUTING_MODES),
  activeProviderId: z.string().optional(),
  fallbackChannelId: z.string().optional().nullable(),
});

export type UpdateChannelFormData = z.infer<typeof updateChannelSchema>;

export const registerProviderSchema = z.object({
  providerName: z.string().min(1, "Provider name is required").max(100),
  providerId: z.string().min(1, "Provider ID is required").max(100),
  channel: z.enum(CHANNEL_TYPES, { message: "Channel is required" }),
  adapterUrl: z.string().url("Must be a valid URL"),
  isActive: z.boolean().optional(),
  routingWeight: z.number().min(0).max(100).optional(),
  rateLimitTokensPerSec: z.number().min(1, "Must be at least 1").optional(),
  rateLimitMaxBurst: z.number().min(1, "Must be at least 1").optional(),
});

export type RegisterProviderFormData = z.infer<typeof registerProviderSchema>;

export const updateProviderSchema = z.object({
  providerName: z.string().min(1, "Provider name is required").max(100).optional(),
  adapterUrl: z.string().url("Must be a valid URL").optional(),
  isActive: z.boolean().optional(),
  routingWeight: z.number().min(0).max(100).optional(),
  rateLimitTokensPerSec: z.number().min(1, "Must be at least 1").optional(),
  rateLimitMaxBurst: z.number().min(1, "Must be at least 1").optional(),
});

export type UpdateProviderFormData = z.infer<typeof updateProviderSchema>;
