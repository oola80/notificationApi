import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  RetryPolicy,
  ShouldRetryResult,
} from './interfaces/retry.interfaces.js';

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  private readonly retryMaxByChannel: Record<string, number>;
  private readonly backoffMultiplier: number;
  private readonly jitterFactor: number;
  private readonly baseDelayMs = 5000;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.retryMaxByChannel = {
      email: this.configService.get<number>('app.retryEmailMax', 5),
      sms: this.configService.get<number>('app.retrySmsMax', 3),
      whatsapp: this.configService.get<number>('app.retryWhatsappMax', 4),
      push: this.configService.get<number>('app.retryPushMax', 4),
    };
    this.backoffMultiplier = this.configService.get<number>(
      'app.retryBackoffMultiplier',
      2,
    );
    this.jitterFactor = this.configService.get<number>(
      'app.retryJitterFactor',
      0.2,
    );
  }

  getRetryPolicy(channel: string): RetryPolicy {
    const maxRetries = this.retryMaxByChannel[channel] ?? 3;
    return {
      maxRetries,
      baseDelayMs: this.baseDelayMs,
    };
  }

  calculateDelay(channel: string, attemptNumber: number): number {
    const delay =
      this.baseDelayMs * Math.pow(this.backoffMultiplier, attemptNumber);
    const jitter = Math.random() * delay * this.jitterFactor;
    return Math.round(delay + jitter);
  }

  shouldRetry(
    channel: string,
    attemptNumber: number,
    retryable: boolean,
  ): ShouldRetryResult {
    if (!retryable) {
      return {
        shouldRetry: false,
        reason: 'Error is not retryable (permanent failure)',
      };
    }

    const policy = this.getRetryPolicy(channel);

    if (attemptNumber >= policy.maxRetries) {
      return {
        shouldRetry: false,
        reason: `Max retries (${policy.maxRetries}) exceeded for channel ${channel}`,
      };
    }

    const delay = this.calculateDelay(channel, attemptNumber);

    this.metricsService.incrementRetry(
      channel,
      'unknown',
      String(attemptNumber + 1),
    );

    return {
      shouldRetry: true,
      delay,
      reason: `Retry ${attemptNumber + 1}/${policy.maxRetries} for channel ${channel}, delay ${delay}ms`,
    };
  }
}
