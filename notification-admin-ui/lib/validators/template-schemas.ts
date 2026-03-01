import { z } from "zod";

export const CHANNEL_OPTIONS = ["email", "sms", "whatsapp", "push"] as const;

export type ChannelOption = (typeof CHANNEL_OPTIONS)[number];

export const CHANNEL_LABELS: Record<ChannelOption, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  push: "Push",
};

const channelVariantSchema = z.object({
  channel: z.enum(CHANNEL_OPTIONS),
  subject: z.string().optional(),
  body: z.string().min(1, "Body content is required"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ChannelVariantFormData = z.infer<typeof channelVariantSchema>;

export const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  slug: z.string().min(1, "Slug is required").max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  description: z.string().optional(),
  channels: z.array(channelVariantSchema).min(1, "At least one channel variant is required"),
});

export type CreateTemplateFormData = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  channels: z.array(channelVariantSchema).min(1, "At least one channel variant is required"),
  changeSummary: z.string().min(1, "Change summary is required"),
});

export type UpdateTemplateFormData = z.infer<typeof updateTemplateSchema>;

/**
 * Generate a URL-safe slug from a template name.
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Extract {{variable}} names from template body text.
 */
export function extractVariables(text: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const vars = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    vars.add(match[1].trim());
  }
  return Array.from(vars).sort();
}

/**
 * SMS character limits for reference.
 */
export const SMS_MAX_CHARS = 160;
export const SMS_CONCAT_CHARS = 153;
export const PUSH_MAX_CHARS = 256;
