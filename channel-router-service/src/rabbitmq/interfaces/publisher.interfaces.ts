export interface DeliveryStatusMessage {
  notificationId: string;
  fromStatus: string;
  toStatus: string;
  channel: string;
  providerId?: string;
  providerName?: string;
  providerMessageId?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface DeliveryAttemptMessage {
  notificationId: string;
  channel: string;
  providerId: string;
  providerName: string;
  attemptNumber: number;
  outcome: string;
  durationMs: number;
  providerMessageId?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
  timestamp: string;
}
