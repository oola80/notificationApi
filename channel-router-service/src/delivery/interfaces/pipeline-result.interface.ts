export interface PipelineResult {
  success: boolean;
  notificationId: string;
  channel: string;
  providerId?: string;
  providerName?: string;
  providerMessageId?: string;
  attemptNumber: number;
  durationMs: number;
  errorMessage?: string;
  retryScheduled?: boolean;
  fallbackTriggered?: boolean;
}
