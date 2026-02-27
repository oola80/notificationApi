import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service.js';
import {
  TokenBucket,
  AcquireResult,
  BucketStatus,
} from './interfaces/rate-limiter.interfaces.js';

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(private readonly metricsService: MetricsService) {}

  initBucket(providerId: string, tokensPerSec: number, maxBurst: number): void {
    this.buckets.set(providerId, {
      capacity: maxBurst,
      refillRate: tokensPerSec,
      currentTokens: maxBurst,
      lastRefillTimestamp: Date.now(),
    });
    this.logger.log(
      `Initialized rate limit bucket for provider ${providerId}: ${tokensPerSec}/sec, burst ${maxBurst}`,
    );
  }

  async acquire(
    providerId: string,
    timeoutMs?: number,
  ): Promise<AcquireResult> {
    const bucket = this.buckets.get(providerId);
    if (!bucket) {
      return { acquired: true, waitMs: 0 };
    }

    this.refill(bucket);

    if (bucket.currentTokens >= 1) {
      bucket.currentTokens--;
      this.metricsService.observeRateLimitWait(providerId, 0);
      return { acquired: true, waitMs: 0 };
    }

    // Calculate wait time until next token
    const waitMs = Math.ceil((1 / bucket.refillRate) * 1000);

    if (timeoutMs !== undefined && waitMs > timeoutMs) {
      this.metricsService.observeRateLimitWait(providerId, timeoutMs);
      return { acquired: false, waitMs: timeoutMs };
    }

    // Wait for token
    await this.sleep(waitMs);
    this.refill(bucket);

    if (bucket.currentTokens >= 1) {
      bucket.currentTokens--;
      this.metricsService.observeRateLimitWait(providerId, waitMs);
      return { acquired: true, waitMs };
    }

    this.metricsService.observeRateLimitWait(providerId, waitMs);
    return { acquired: false, waitMs };
  }

  getStatus(providerId: string): BucketStatus | null {
    const bucket = this.buckets.get(providerId);
    if (!bucket) return null;

    this.refill(bucket);
    return {
      available: Math.floor(bucket.currentTokens),
      capacity: bucket.capacity,
      refillRate: bucket.refillRate,
    };
  }

  private refill(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = (now - bucket.lastRefillTimestamp) / 1000;
    const tokensToAdd = elapsed * bucket.refillRate;

    if (tokensToAdd > 0) {
      bucket.currentTokens = Math.min(
        bucket.capacity,
        bucket.currentTokens + tokensToAdd,
      );
      bucket.lastRefillTimestamp = now;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
