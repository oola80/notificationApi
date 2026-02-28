import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per second

  private tokens: number;
  private lastRefillTime: number;

  constructor(private readonly configService: ConfigService) {
    this.capacity = this.configService.get<number>('app.workerRateLimit', 50);
    this.refillRate = this.capacity; // refill to capacity per second
    this.tokens = this.capacity;
    this.lastRefillTime = Date.now();
  }

  async acquire(): Promise<number> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return 0;
    }

    // Calculate wait time until 1 token is available
    const waitMs = ((1 - this.tokens) / this.refillRate) * 1000;
    await this.sleep(waitMs);

    this.refill();
    this.tokens -= 1;
    return waitMs / 1000; // return wait time in seconds
  }

  tryAcquire(): boolean {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }

    return false;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  private refill(): void {
    const now = Date.now();
    const elapsedMs = now - this.lastRefillTime;
    const tokensToAdd = (elapsedMs / 1000) * this.refillRate;

    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefillTime = now;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, Math.ceil(ms)));
  }
}
