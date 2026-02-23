import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RateLimiterService {
  private readonly windows = new Map<string, number[]>();
  private readonly globalWebhookLimit: number;

  constructor(private readonly configService: ConfigService) {
    this.globalWebhookLimit = this.configService.get<number>(
      'app.webhookRateLimit',
      100,
    );
  }

  checkGlobalWebhookLimit(): boolean {
    return this.isAllowed('__global_webhook__', this.globalWebhookLimit);
  }

  checkSourceLimit(sourceId: string, maxRps: number): boolean {
    return this.isAllowed(`source:${sourceId}`, maxRps);
  }

  private isAllowed(key: string, limit: number): boolean {
    const now = Date.now();
    const windowStart = now - 1000;

    let timestamps = this.windows.get(key);
    if (!timestamps) {
      timestamps = [];
      this.windows.set(key, timestamps);
    }

    // Prune expired entries (older than 1 second)
    const firstValid = timestamps.findIndex((t) => t > windowStart);
    if (firstValid > 0) {
      timestamps.splice(0, firstValid);
    } else if (firstValid === -1 && timestamps.length > 0) {
      timestamps.length = 0;
    }

    if (timestamps.length >= limit) {
      return false;
    }

    timestamps.push(now);
    return true;
  }
}
