export enum WebhookEventType {
  DELIVERED = 'delivered',
  OPENED = 'opened',
  CLICKED = 'clicked',
  BOUNCED = 'bounced',
  FAILED = 'failed',
  COMPLAINED = 'complained',
  UNSUBSCRIBED = 'unsubscribed',
}

export class WebhookEventDto {
  providerId: string;
  providerName: string;
  providerMessageId: string;
  eventType: WebhookEventType;
  rawStatus: string;
  notificationId: string;
  correlationId: string;
  cycleId: string;
  recipientAddress: string;
  timestamp: string;
  metadata: Record<string, any>;
}
