export interface SendRequest {
  notificationId: string;
  channel: string;
  priority: string;
  recipient: {
    email?: string;
    phone?: string;
    name?: string;
    customerId?: string;
    deviceToken?: string;
  };
  content: {
    subject?: string;
    body: string;
    templateName?: string;
    templateLanguage?: string;
    templateParameters?: Array<{ name: string; value: string }>;
  };
  media?: Array<{
    type: string;
    filename?: string;
    mimeType: string;
    content?: string;
    url?: string;
    context: string;
  }>;
  metadata: {
    correlationId?: string;
    sourceId?: string;
    eventType?: string;
    cycleId?: string;
    dispatchedAt?: string;
  };
}

export interface SendResult {
  success: boolean;
  providerMessageId: string | null;
  retryable: boolean;
  errorMessage: string | null;
  httpStatus: number;
  providerResponse: Record<string, any> | null;
}

export interface AdapterHealthResponse {
  status: string;
  providerId: string;
  providerName: string;
  supportedChannels: string[];
  latencyMs: number;
  details: Record<string, any>;
}

export interface AdapterCapabilitiesResponse {
  providerId: string;
  providerName: string;
  supportedChannels: string[];
  supportsAttachments: boolean;
  supportsMediaUrls: boolean;
  maxAttachmentSizeMb: number;
  maxRecipientsPerRequest: number;
  webhookPath: string | null;
}
