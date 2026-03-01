import { z } from "zod";

export const TRANSFORM_OPTIONS = [
  "none",
  "toString",
  "toNumber",
  "toBoolean",
  "toDate",
  "uppercase",
  "lowercase",
  "trim",
  "split",
  "join",
  "template",
] as const;

export type TransformType = (typeof TRANSFORM_OPTIONS)[number];

const fieldMappingEntrySchema = z.object({
  sourceField: z.string().min(1, "Source field is required"),
  targetField: z.string().min(1, "Target field is required"),
  transform: z.enum(TRANSFORM_OPTIONS),
  required: z.boolean(),
  defaultValue: z.string().optional(),
});

export type FieldMappingEntry = z.infer<typeof fieldMappingEntrySchema>;

export const createMappingSchema = z.object({
  sourceId: z.string().min(1, "Source ID is required"),
  eventType: z.string().min(1, "Event type is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  priority: z.enum(["normal", "critical"]),
  isActive: z.boolean(),
  fieldMappings: z
    .array(fieldMappingEntrySchema)
    .min(1, "At least one field mapping is required"),
  timestampField: z.string().optional(),
  timestampFormat: z.string().optional(),
  sourceEventIdField: z.string().optional(),
});

export type CreateMappingFormData = z.infer<typeof createMappingSchema>;

export const updateMappingSchema = createMappingSchema;

export type UpdateMappingFormData = z.infer<typeof updateMappingSchema>;

/**
 * Convert the flat fieldMappings array (form shape) into the
 * Record<string, unknown> shape expected by the backend API.
 */
export function fieldMappingsToApi(
  entries: FieldMappingEntry[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const entry of entries) {
    const mapping: Record<string, unknown> = { path: entry.sourceField };
    if (entry.transform && entry.transform !== "none") {
      mapping.transform = entry.transform;
    }
    if (entry.required) {
      mapping.required = true;
    }
    if (entry.defaultValue) {
      mapping.default = entry.defaultValue;
    }
    result[entry.targetField] = mapping;
  }
  return result;
}

/**
 * Convert the backend Record<string, unknown> field mappings into
 * the flat array shape used by the form.
 */
export function fieldMappingsFromApi(
  raw: Record<string, unknown>,
): FieldMappingEntry[] {
  return Object.entries(raw).map(([targetField, value]) => {
    const mapping = value as Record<string, unknown> | undefined;
    return {
      targetField,
      sourceField: (mapping?.path as string) ?? "",
      transform: (mapping?.transform as TransformType) ?? "none",
      required: (mapping?.required as boolean) ?? false,
      defaultValue: (mapping?.default as string) ?? "",
    };
  });
}
