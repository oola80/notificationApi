export type ChannelType = "email" | "sms" | "whatsapp" | "push";
export type RecipientType = "customer" | "group" | "custom";
export type DeliveryPriority = "normal" | "critical";

export interface RuleAction {
  templateId: string;
  channels: ChannelType[];
  recipientType: RecipientType;
  recipientGroupId?: string;
  customRecipients?: Record<string, unknown>[];
  delayMinutes?: number;
}

export interface Rule {
  id: string;
  name: string;
  eventType: string;
  description: string | null;
  conditions: Record<string, unknown> | null;
  actions: RuleAction[];
  suppression: Record<string, unknown> | null;
  deliveryPriority: DeliveryPriority | null;
  priority: number;
  isExclusive: boolean;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuleDto {
  name: string;
  eventType: string;
  actions: RuleAction[];
  conditions?: Record<string, unknown>;
  suppression?: Record<string, unknown>;
  deliveryPriority?: DeliveryPriority;
  priority?: number;
  isExclusive?: boolean;
  createdBy?: string;
}

export interface UpdateRuleDto {
  name?: string;
  eventType?: string;
  actions?: RuleAction[];
  conditions?: Record<string, unknown>;
  suppression?: Record<string, unknown>;
  deliveryPriority?: DeliveryPriority;
  priority?: number;
  isExclusive?: boolean;
  isActive?: boolean;
  updatedBy?: string;
}
