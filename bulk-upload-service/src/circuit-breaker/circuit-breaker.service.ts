import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly threshold: number;
  private readonly cooldownMs: number;

  private state = CircuitBreakerState.CLOSED;
  private consecutiveFailures = 0;
  private lastFailureTime: number | null = null;

  constructor(private readonly configService: ConfigService) {
    this.threshold = this.configService.get<number>(
      'app.circuitBreakerThreshold',
      3,
    );
    this.cooldownMs = this.configService.get<number>(
      'app.circuitBreakerCooldownMs',
      30000,
    );
  }

  canExecute(): boolean {
    if (this.state === CircuitBreakerState.CLOSED) {
      return true;
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      return true;
    }

    // OPEN state — check if cooldown has elapsed
    if (this.lastFailureTime !== null) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.cooldownMs) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.logger.log(
          'Circuit breaker transitioned to HALF_OPEN (cooldown elapsed)',
        );
        return true;
      }
    }

    return false;
  }

  recordSuccess(): void {
    if (
      this.state === CircuitBreakerState.HALF_OPEN ||
      this.state === CircuitBreakerState.OPEN
    ) {
      this.logger.log('Circuit breaker recovered → CLOSED');
    }
    this.state = CircuitBreakerState.CLOSED;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
  }

  recordFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.OPEN;
      this.logger.warn(
        'Circuit breaker tripped → OPEN (probe request failed in HALF_OPEN)',
      );
      return;
    }

    if (this.consecutiveFailures >= this.threshold) {
      this.state = CircuitBreakerState.OPEN;
      this.logger.warn(
        `Circuit breaker tripped → OPEN (${this.consecutiveFailures} consecutive failures, threshold=${this.threshold})`,
      );
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  getCooldownMs(): number {
    return this.cooldownMs;
  }

  getTimeUntilRetry(): number {
    if (this.state !== CircuitBreakerState.OPEN || !this.lastFailureTime) {
      return 0;
    }
    const elapsed = Date.now() - this.lastFailureTime;
    return Math.max(0, this.cooldownMs - elapsed);
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
    this.logger.log('Circuit breaker manually reset → CLOSED');
  }
}
