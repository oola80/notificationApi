export interface DispatchMessage {
  notificationId: string;
  eventId: string;
  ruleId: string;
  channel: string;
  priority: string;
  recipient: {
    email?: string;
    phone?: string;
    deviceToken?: string;
    name?: string;
    customerId?: string;
  };
  content: {
    subject?: string;
    body: string;
    templateName?: string;
    templateLanguage?: string;
    templateParameters?: string[];
  };
  media?: MediaEntry[];
  metadata: {
    correlationId?: string;
    sourceId?: string;
    eventType?: string;
    cycleId?: string;
    dispatchedAt?: string;
    fallbackChannel?: string;
  };
  attemptNumber?: number;
  isFallback?: boolean;
}

export interface MediaEntry {
  type: string;
  url: string;
  alt?: string;
  filename?: string;
  mimeType?: string;
  context: 'inline' | 'attachment';
}
