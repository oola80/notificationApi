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
  name?: string;
  description?: string;
  channels?: TemplateChannel[];
  updatedBy?: string;
}

export interface RenderResult {
  channel: ChannelType;
  subject?: string;
  body: string;
}

export interface PreviewResult {
  renderedChannels: RenderResult[];
}
