import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProviderConfigsRepository } from '../providers/provider-configs.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  CircuitBreakerState,
  CircuitBreakerEntry,
  CircuitBreakerSnapshot,
} from './interfaces/circuit-breaker.interfaces.js';

@Injectable()
export class CircuitBreakerService implements OnModuleInit {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, CircuitBreakerEntry>();

  private readonly failureThreshold: number;
  private readonly failureWindowMs: number;
  private readonly cooldownMs: number;
  private readonly halfOpenMaxAttempts: number;
  private readonly successThreshold: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly providerConfigsRepo: ProviderConfigsRepository,
    private readonly metricsService: MetricsService,
  ) {
    this.failureThreshold = this.configService.get<number>(
      'app.cbFailureThreshold',
      5,
    );
    this.failureWindowMs = this.configService.get<number>(
      'app.cbFailureWindowMs',
      60000,
    );
    this.cooldownMs = this.configService.get<number>('app.cbCooldownMs', 30000);
    this.halfOpenMaxAttempts = this.configService.get<number>(
      'app.cbHalfOpenMaxAttempts',
      1,
    );
    this.successThreshold = this.configService.get<number>(
      'app.cbSuccessThreshold',
      2,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.loadStateFromDb();
  }

  async loadStateFromDb(): Promise<void> {
    try {
      const providers = await this.providerConfigsRepo.findAllProviders();
      for (const provider of providers) {
        const state =
          (provider.circuitBreakerState as CircuitBreakerState) ??
          CircuitBreakerState.CLOSED;
        this.breakers.set(provider.id, {
          state,
          failureCount: provider.failureCount ?? 0,
          successCount: 0,
          lastFailureAt: provider.lastFailureAt
            ? provider.lastFailureAt.getTime()
            : null,
          openedAt:
            state === CircuitBreakerState.OPEN && provider.lastFailureAt
              ? provider.lastFailureAt.getTime()
              : null,
          halfOpenAttempts: 0,
        });
        this.updateMetric(provider.id, state);
      }
      this.logger.log(
        `Loaded circuit breaker state for ${providers.length} providers`,
      );
    } catch (error) {
      this.logger.error('Failed to load circuit breaker state from DB', error);
    }
  }

  getState(providerId: string): CircuitBreakerState {
    const entry = this.getOrCreateEntry(providerId);
    if (
      entry.state === CircuitBreakerState.OPEN &&
      this.isCooldownElapsed(entry)
    ) {
      this.transitionTo(providerId, entry, CircuitBreakerState.HALF_OPEN);
    }
    return entry.state;
  }

  canExecute(providerId: string): boolean {
    const state = this.getState(providerId);
    if (state === CircuitBreakerState.CLOSED) {
      return true;
    }
    if (state === CircuitBreakerState.HALF_OPEN) {
      const entry = this.breakers.get(providerId)!;
      return entry.halfOpenAttempts < this.halfOpenMaxAttempts;
    }
    return false;
  }

  recordSuccess(providerId: string): void {
    const entry = this.getOrCreateEntry(providerId);
    if (entry.state === CircuitBreakerState.HALF_OPEN) {
      entry.successCount++;
      if (entry.successCount >= this.successThreshold) {
        this.transitionTo(providerId, entry, CircuitBreakerState.CLOSED);
      }
    } else if (entry.state === CircuitBreakerState.CLOSED) {
      // Reset failure count on success in CLOSED state
      entry.failureCount = 0;
    }
  }

  recordFailure(providerId: string): void {
    const entry = this.getOrCreateEntry(providerId);
    const now = Date.now();

    if (entry.state === CircuitBreakerState.HALF_OPEN) {
      this.transitionTo(providerId, entry, CircuitBreakerState.OPEN);
      return;
    }

    if (entry.state === CircuitBreakerState.CLOSED) {
      // If first failure or failure window expired, reset counter
      if (
        entry.lastFailureAt !== null &&
        now - entry.lastFailureAt > this.failureWindowMs
      ) {
        entry.failureCount = 0;
      }
      entry.failureCount++;
      entry.lastFailureAt = now;

      if (entry.failureCount >= this.failureThreshold) {
        this.transitionTo(providerId, entry, CircuitBreakerState.OPEN);
      }
    }
  }

  recordHealthCheckFailure(providerId: string): void {
    this.recordFailure(providerId);
  }

  reset(providerId: string): void {
    const entry = this.getOrCreateEntry(providerId);
    this.transitionTo(providerId, entry, CircuitBreakerState.CLOSED);
  }

  getAll(): Map<string, CircuitBreakerSnapshot> {
    const result = new Map<string, CircuitBreakerSnapshot>();
    for (const [providerId, entry] of this.breakers) {
      // Check for auto-transition from OPEN → HALF_OPEN
      if (
        entry.state === CircuitBreakerState.OPEN &&
        this.isCooldownElapsed(entry)
      ) {
        this.transitionTo(providerId, entry, CircuitBreakerState.HALF_OPEN);
      }
      result.set(providerId, {
        providerId,
        state: entry.state,
        failureCount: entry.failureCount,
        successCount: entry.successCount,
        lastFailureAt: entry.lastFailureAt,
        openedAt: entry.openedAt,
        halfOpenAttempts: entry.halfOpenAttempts,
      });
    }
    return result;
  }

  private getOrCreateEntry(providerId: string): CircuitBreakerEntry {
    let entry = this.breakers.get(providerId);
    if (!entry) {
      entry = {
        state: CircuitBreakerState.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureAt: null,
        openedAt: null,
        halfOpenAttempts: 0,
      };
      this.breakers.set(providerId, entry);
    }
    return entry;
  }

  private isCooldownElapsed(entry: CircuitBreakerEntry): boolean {
    if (entry.openedAt === null) return false;
    return Date.now() - entry.openedAt >= this.cooldownMs;
  }

  private transitionTo(
    providerId: string,
    entry: CircuitBreakerEntry,
    newState: CircuitBreakerState,
  ): void {
    const oldState = entry.state;
    entry.state = newState;

    if (newState === CircuitBreakerState.OPEN) {
      entry.openedAt = Date.now();
      entry.successCount = 0;
      entry.halfOpenAttempts = 0;
      if (oldState === CircuitBreakerState.CLOSED) {
        this.metricsService.incrementCircuitBreakerTrips(providerId);
      }
    } else if (newState === CircuitBreakerState.HALF_OPEN) {
      entry.halfOpenAttempts = 0;
      entry.successCount = 0;
    } else if (newState === CircuitBreakerState.CLOSED) {
      entry.failureCount = 0;
      entry.successCount = 0;
      entry.lastFailureAt = null;
      entry.openedAt = null;
      entry.halfOpenAttempts = 0;
    }

    this.updateMetric(providerId, newState);
    this.persistStateToDb(providerId, entry).catch((err) => {
      this.logger.error(
        `Failed to persist circuit breaker state for provider ${providerId}`,
        err,
      );
    });

    this.logger.log(
      `Circuit breaker transition for provider ${providerId}: ${oldState} → ${newState}`,
    );
  }

  private updateMetric(providerId: string, state: CircuitBreakerState): void {
    const stateValue =
      state === CircuitBreakerState.CLOSED
        ? 0
        : state === CircuitBreakerState.HALF_OPEN
          ? 1
          : 2;
    this.metricsService.setCircuitBreakerState(providerId, stateValue);
  }

  private async persistStateToDb(
    providerId: string,
    entry: CircuitBreakerEntry,
  ): Promise<void> {
    try {
      const provider = await this.providerConfigsRepo.findById(providerId);
      if (!provider) return;

      provider.circuitBreakerState = entry.state;
      provider.failureCount = entry.failureCount;
      provider.lastFailureAt = entry.lastFailureAt
        ? new Date(entry.lastFailureAt)
        : null;

      await this.providerConfigsRepo.save(provider);
    } catch (error) {
      this.logger.error(
        `Failed to persist circuit breaker state for ${providerId}`,
        error,
      );
    }
  }
}
