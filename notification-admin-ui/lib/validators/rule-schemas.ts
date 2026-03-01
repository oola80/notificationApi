import { z } from "zod";

export const CONDITION_OPERATORS = [
  "equals",
  "notEquals",
  "contains",
  "gt",
  "lt",
  "gte",
  "lte",
  "in",
  "notIn",
  "exists",
  "regex",
] as const;

export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const CHANNEL_OPTIONS = ["email", "sms", "whatsapp", "push"] as const;

export const RECIPIENT_TYPES = ["customer", "group", "custom"] as const;

const conditionRowSchema = z.object({
  field: z.string().min(1, "Field is required"),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.string().min(1, "Value is required"),
});

export type ConditionRow = z.infer<typeof conditionRowSchema>;

const ruleActionSchema = z.object({
  templateId: z.string().min(1, "Template ID is required"),
  channels: z
    .array(z.enum(CHANNEL_OPTIONS))
    .min(1, "At least one channel is required"),
  recipientType: z.enum(RECIPIENT_TYPES),
  recipientGroupId: z.string().optional(),
  delayMinutes: z.number().min(0).optional(),
});

export type RuleActionFormData = z.infer<typeof ruleActionSchema>;

const suppressionSchema = z.object({
  windowMinutes: z.number().min(1, "Window must be at least 1 minute").optional(),
  maxCount: z.number().min(1, "Max count must be at least 1").optional(),
  key: z.string().optional(),
});

export const createRuleSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  eventType: z.string().min(1, "Event type is required").max(100),
  priority: z.number().min(0, "Priority must be 0 or greater"),
  isExclusive: z.boolean(),
  deliveryPriority: z.enum(["normal", "critical"]).optional(),
  conditions: z.array(conditionRowSchema).optional(),
  actions: z.array(ruleActionSchema).min(1, "At least one action is required"),
  suppressionEnabled: z.boolean(),
  suppression: suppressionSchema.optional(),
});

export type CreateRuleFormData = z.infer<typeof createRuleSchema>;

/**
 * Convert the flat conditions array (form shape) into the
 * Record<string, unknown> shape expected by the backend API.
 *
 * Form: [{ field: "totalAmount", operator: "gt", value: "50" }]
 * API:  { "totalAmount": { "$gt": 50 } }
 */
const OPERATOR_MAP: Record<ConditionOperator, string> = {
  equals: "$eq",
  notEquals: "$ne",
  contains: "$contains",
  gt: "$gt",
  lt: "$lt",
  gte: "$gte",
  lte: "$lte",
  in: "$in",
  notIn: "$nin",
  exists: "$exists",
  regex: "$regex",
};

function parseValue(value: string, operator: ConditionOperator): unknown {
  if (operator === "exists") return value === "true";
  if (operator === "in" || operator === "notIn") {
    return value.split(",").map((v) => v.trim());
  }
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== "") return num;
  return value;
}

export function conditionsToApi(
  rows: ConditionRow[],
): Record<string, unknown> | undefined {
  if (!rows || rows.length === 0) return undefined;
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    const op = OPERATOR_MAP[row.operator];
    const val = parseValue(row.value, row.operator);
    result[row.field] = { [op]: val };
  }
  return result;
}

/**
 * Convert the backend conditions Record back to the flat array form.
 */
const REVERSE_OPERATOR_MAP: Record<string, ConditionOperator> = {};
for (const [key, val] of Object.entries(OPERATOR_MAP)) {
  REVERSE_OPERATOR_MAP[val] = key as ConditionOperator;
}

export function conditionsFromApi(
  raw: Record<string, unknown> | null | undefined,
): ConditionRow[] {
  if (!raw) return [];
  const rows: ConditionRow[] = [];
  for (const [field, condition] of Object.entries(raw)) {
    if (typeof condition === "object" && condition !== null) {
      const cond = condition as Record<string, unknown>;
      for (const [op, val] of Object.entries(cond)) {
        const operator = REVERSE_OPERATOR_MAP[op] ?? "equals";
        const value = Array.isArray(val) ? val.join(", ") : String(val);
        rows.push({ field, operator, value });
      }
    }
  }
  return rows;
}

/**
 * Convert suppression form data to API format.
 */
export function suppressionToApi(
  enabled: boolean,
  data?: { windowMinutes?: number; maxCount?: number; key?: string },
): Record<string, unknown> | undefined {
  if (!enabled || !data) return undefined;
  const result: Record<string, unknown> = {};
  if (data.windowMinutes) result.windowMinutes = data.windowMinutes;
  if (data.maxCount) result.maxCount = data.maxCount;
  if (data.key) result.key = data.key;
  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Convert backend suppression to form data.
 */
export function suppressionFromApi(
  raw: Record<string, unknown> | null | undefined,
): { enabled: boolean; windowMinutes?: number; maxCount?: number; key?: string } {
  if (!raw || Object.keys(raw).length === 0) return { enabled: false };
  return {
    enabled: true,
    windowMinutes: raw.windowMinutes as number | undefined,
    maxCount: raw.maxCount as number | undefined,
    key: raw.key as string | undefined,
  };
}
