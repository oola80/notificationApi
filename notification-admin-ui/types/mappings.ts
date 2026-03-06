export interface EventMapping {
  id: string;
  sourceId: string;
  eventType: string;
  name: string;
  description: string | null;
  fieldMappings: Record<string, unknown>;
  eventTypeMapping: Record<string, unknown> | null;
  timestampField: string | null;
  timestampFormat: string | null;
  sourceEventIdField: string | null;
  validationSchema: Record<string, unknown> | null;
  priority: "normal" | "critical";
  isActive: boolean;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMappingDto {
  sourceId: string;
  eventType: string;
  name: string;
  description?: string;
  fieldMappings: Record<string, unknown>;
  eventTypeMapping?: Record<string, unknown>;
  timestampField?: string;
  timestampFormat?: string;
  sourceEventIdField?: string;
  validationSchema?: Record<string, unknown>;
  priority?: "normal" | "critical";
  createdBy?: string;
}

export interface UpdateMappingDto {
  name?: string;
  isActive?: boolean;
  description?: string;
  fieldMappings?: Record<string, unknown>;
  eventTypeMapping?: Record<string, unknown>;
  timestampField?: string;
  timestampFormat?: string;
  sourceEventIdField?: string;
  validationSchema?: Record<string, unknown>;
  priority?: "normal" | "critical";
  updatedBy?: string;
}

export interface TestMappingPayload {
  samplePayload: Record<string, unknown>;
}

export interface TestMappingResult {
  canonicalEvent: Record<string, unknown>;
  warnings: string[];
  missingRequiredFields: string[];
}
