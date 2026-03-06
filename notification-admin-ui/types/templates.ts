import type { ChannelType } from "./rules";

export interface TemplateChannel {
  channel: ChannelType;
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export interface TemplateVersion {
  id: string;
  versionNumber: number;
  channels: TemplateChannel[];
  createdBy: string | null;
  createdAt: string;
}

export interface TemplateVariable {
  id: string;
  variableName: string;
  defaultValue: string | null;
  isRequired: boolean;
}

export interface Template {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  currentVersionId: string | null;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  versions: TemplateVersion[];
  variables: TemplateVariable[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateDto {
  slug: string;
  name: string;
  description?: string;
  channels: TemplateChannel[];
  createdBy?: string;
}

export interface UpdateTemplateDto {
  channels: TemplateChannel[];
  changeSummary: string;
  updatedBy?: string;
}

export interface RenderResult {
  channel: string;
  subject?: string;
  body: string;
  warnings: string[];
}

export interface RenderResponse {
  rendered: { subject?: string; body: string };
  metadata: {
    templateId: string;
    versionNumber: number;
    channel: string;
    renderedAt: string;
    renderDurationMs: number;
  };
  channelMetadata: Record<string, unknown>;
  warnings: string[];
}

export interface PreviewResult {
  previews: RenderResult[];
  metadata: {
    templateId: string;
    versionNumber: number;
    renderedAt: string;
  };
}
