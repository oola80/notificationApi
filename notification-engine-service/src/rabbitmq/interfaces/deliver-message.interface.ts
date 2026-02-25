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
  };
  media?: Record<string, any>;
  metadata: Record<string, any>;
}
