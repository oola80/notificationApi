import { Injectable, Logger } from '@nestjs/common';
import {
  createErrorResponse,
  MetricsService,
  RabbitMQPublisherService,
} from '@app/common';
import { MAILGUN_ERROR_CODES } from '../errors/mailgun-errors.js';
import { WebhookVerificationService } from './webhook-verification.service.js';
import { WebhookNormalizerService } from './webhook-normalizer.service.js';
import { MailgunWebhookPayload } from './interfaces/mailgun-webhook.interfaces.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly verificationService: WebhookVerificationService,
    private readonly normalizerService: WebhookNormalizerService,
    private readonly publisherService: RabbitMQPublisherService,
    private readonly metricsService: MetricsService,
  ) {}

  async processWebhook(payload: MailgunWebhookPayload): Promise<void> {
    // Step 1: Verify signature
    const isValid = this.verificationService.verify(payload.signature);
    if (!isValid) {
      throw createErrorResponse(
        'MG-004',
        MAILGUN_ERROR_CODES,
        'Mailgun webhook signature verification failed',
      );
    }

    // Step 2: Normalize event
    const event = this.normalizerService.normalize(payload);

    // Step 3: Publish to RabbitMQ (fire-and-forget)
    try {
      this.publisherService.publishWebhookEvent(event);
    } catch (error) {
      this.logger.error(
        `Failed to publish webhook event to RabbitMQ: ${(error as Error).message}`,
      );
      this.metricsService.incrementRabbitmqPublish('mailgun', 'failed');
      // Don't throw — fire-and-forget pattern
    }

    // Step 4: Record metrics
    this.metricsService.incrementWebhookReceived('mailgun', event.eventType);

    this.logger.log(
      `Processed Mailgun webhook: ${event.eventType} for ${event.providerMessageId}`,
    );
  }
}
