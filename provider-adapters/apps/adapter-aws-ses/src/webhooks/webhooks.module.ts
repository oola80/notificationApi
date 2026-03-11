import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AppRabbitMQModule } from '@app/common';
import { WebhookVerificationService } from './webhook-verification.service.js';
import { WebhookNormalizerService } from './webhook-normalizer.service.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhooksController } from './webhooks.controller.js';

@Module({
  imports: [AppRabbitMQModule, HttpModule.register({ timeout: 5000 })],
  controllers: [WebhooksController],
  providers: [
    WebhookVerificationService,
    WebhookNormalizerService,
    WebhooksService,
  ],
  exports: [WebhooksService],
})
export class WebhooksModule {}
