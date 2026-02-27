export interface MailgunWebhookSignature {
  timestamp: string;
  token: string;
  signature: string;
}

export interface MailgunWebhookEventData {
  event: string;
  id: string;
  timestamp: number;
  severity?: string;
  reason?: string;
  message: {
    headers: {
      'message-id': string;
      to: string;
      from: string;
      subject: string;
    };
  };
  recipient: string;
  'user-variables': Record<string, string>;
  'delivery-status'?: {
    code: number;
    message: string;
    description: string;
  };
  ip?: string;
  url?: string;
  geolocation?: Record<string, any>;
}

export interface MailgunWebhookPayload {
  signature: MailgunWebhookSignature;
  'event-data': MailgunWebhookEventData;
}
