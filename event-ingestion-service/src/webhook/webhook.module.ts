import { Module } from '@nestjs/common';
import { WebhookController } from './webhook.controller.js';
import { WebhookService } from './webhook.service.js';
import { SourceAuthService } from './services/source-auth.service.js';
import { SourceAuthGuard } from './guards/source-auth.guard.js';
import { ConsumersModule } from '../consumers/consumers.module.js';
import { EventSourcesModule } from '../event-sources/event-sources.module.js';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module.js';
import { WebhookRateLimitGuard } from '../rate-limiter/guards/webhook-rate-limit.guard.js';

@Module({
  imports: [ConsumersModule, EventSourcesModule, RateLimiterModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    SourceAuthService,
    SourceAuthGuard,
    WebhookRateLimitGuard,
  ],
})
export class WebhookModule {}
