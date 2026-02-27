export interface RetryPolicy {
  maxRetries: number;
  baseDelayMs: number;
}

export interface ShouldRetryResult {
  shouldRetry: boolean;
  delay?: number;
  reason: string;
}
