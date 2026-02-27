export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerEntry {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  openedAt: number | null;
  halfOpenAttempts: number;
}

export interface CircuitBreakerSnapshot {
  providerId: string;
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  openedAt: number | null;
  halfOpenAttempts: number;
}
