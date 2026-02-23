import { Module } from '@nestjs/common';
import { RateLimiterService } from './rate-limiter.service.js';
import { WebhookRateLimitGuard } from './guards/webhook-rate-limit.guard.js';

@Module({
  providers: [RateLimiterService, WebhookRateLimitGuard],
  exports: [RateLimiterService, WebhookRateLimitGuard],
})
export class RateLimiterModule {}
