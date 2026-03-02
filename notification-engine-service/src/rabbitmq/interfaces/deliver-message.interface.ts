export interface DeliverMessage {
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
    templateVersion?: number;
    templateName?: string;
    templateLanguage?: string;
    templateParameters?: Array<{ name: string; value: string }>;
  };
  media?: Record<string, any>;
  metadata: Record<string, any>;
}
