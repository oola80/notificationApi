export interface TokenBucket {
  capacity: number;
  refillRate: number;
  currentTokens: number;
  lastRefillTimestamp: number;
}

export interface AcquireResult {
  acquired: boolean;
  waitMs: number;
}

export interface BucketStatus {
  available: number;
  capacity: number;
  refillRate: number;
}
