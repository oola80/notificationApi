import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service.js';
import { createErrorResponse } from '../common/errors.js';

export enum CircuitState {
  CLOSED = 0,
  OPEN = 1,
  HALF_OPEN = 2,
}

@Injectable()
export class CircuitBreakerService implements OnModuleInit {
  private readonly logger = new Logger(CircuitBreakerService.name);

  private state: CircuitState = CircuitState.CLOSED;
  private consecutiveFailures = 0;
  private lastFailureTime = 0;

  private readonly threshold: number;
  private readonly resetMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.threshold = this.configService.get<number>(
      'app.templateServiceCbThreshold',
      5,
    );
    this.resetMs = this.configService.get<number>(
      'app.templateServiceCbResetMs',
      60000,
    );
  }

  onModuleInit(): void {
    this.metricsService.setTemplateServiceCircuitState(this.state);
  }

  getState(): CircuitState {
    return this.state;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime >= this.resetMs) {
        this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        throw createErrorResponse('NES-020');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      if (this.isServiceFailure(error as Error)) {
        this.onFailure();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.consecutiveFailures > 0 || this.state !== CircuitState.CLOSED) {
      this.consecutiveFailures = 0;
      this.transitionTo(CircuitState.CLOSED);
    }
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    } else if (
      this.state === CircuitState.CLOSED &&
      this.consecutiveFailures >= this.threshold
    ) {
      this.transitionTo(CircuitState.OPEN);
    }
  }

  private isServiceFailure(error: Error): boolean {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === 'object' && response !== null) {
        const code = (response as any).code;
        if (code === 'NES-019') {
          return false;
        }
      }
    }
    return true;
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      this.logger.log({
        msg: 'Circuit breaker state transition',
        from: CircuitState[this.state],
        to: CircuitState[newState],
        consecutiveFailures: this.consecutiveFailures,
      });
      this.state = newState;
      this.metricsService.setTemplateServiceCircuitState(newState);
    }
  }
}
