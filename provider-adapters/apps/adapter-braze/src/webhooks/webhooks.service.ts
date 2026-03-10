import { Injectable, Logger } from '@nestjs/common';
import { MetricsService, RabbitMQPublisherService } from '@app/common';
import { WebhookVerificationService } from './webhook-verification.service.js';
import { WebhookNormalizerService } from './webhook-normalizer.service.js';
import type {
  BrazePostbackPayload,
  BrazeCurrentsPayload,
  BrazeWebhookPayload,
} from './interfaces/braze-webhook.interfaces.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly verificationService: WebhookVerificationService,
    private readonly normalizerService: WebhookNormalizerService,
    private readonly publisherService: RabbitMQPublisherService,
    private readonly metricsService: MetricsService,
  ) {}

  /**
   * Process an incoming Braze webhook.
   * Always resolves (fire-and-forget) — the controller returns 200 regardless.
   * Verification failures are logged but do not throw.
   */
  async processWebhook(
    webhookKey: string | undefined,
    payload: BrazeWebhookPayload,
  ): Promise<void> {
    // Step 1: Verify shared secret
    const isValid = this.verificationService.verify(webhookKey);
    if (!isValid) {
      this.logger.warn('Braze webhook rejected: verification failed');
      return;
    }

    // Step 2: Determine payload type and process
    if (this.isCurrentsPayload(payload)) {
      await this.processCurrentsBatch(payload);
    } else {
      await this.processPostback(payload as BrazePostbackPayload);
    }
  }

  private async processPostback(
    payload: BrazePostbackPayload,
  ): Promise<void> {
    const event = this.normalizerService.normalizePostback(payload);

    if (!event) {
      // Unknown event type — already logged by normalizer
      return;
    }

    // Publish to RabbitMQ (fire-and-forget)
    try {
      this.publisherService.publishWebhookEvent(event);
    } catch (error) {
      this.logger.error(
        `Failed to publish webhook event to RabbitMQ: ${(error as Error).message}`,
      );
      this.metricsService.incrementRabbitmqPublish('braze', 'failed');
    }

    this.metricsService.incrementWebhookReceived('braze', event.eventType);
    this.logger.log(
      `Processed Braze postback: ${event.eventType} for ${event.providerMessageId}`,
    );
  }

  private async processCurrentsBatch(
    payload: BrazeCurrentsPayload,
  ): Promise<void> {
    const events = payload.events ?? [];

    this.logger.log(`Processing Braze Currents batch: ${events.length} events`);

    for (const currentsEvent of events) {
      const event =
        this.normalizerService.normalizeCurrentsEvent(currentsEvent);

      if (!event) {
        // Unknown event type — already logged by normalizer
        continue;
      }

      // Publish to RabbitMQ (fire-and-forget)
      try {
        this.publisherService.publishWebhookEvent(event);
      } catch (error) {
        this.logger.error(
          `Failed to publish Currents event to RabbitMQ: ${(error as Error).message}`,
        );
        this.metricsService.incrementRabbitmqPublish('braze', 'failed');
      }

      this.metricsService.incrementWebhookReceived('braze', event.eventType);
    }

    this.logger.log(
      `Finished processing Braze Currents batch: ${events.length} events`,
    );
  }

  private isCurrentsPayload(
    payload: BrazeWebhookPayload,
  ): payload is BrazeCurrentsPayload {
    return Array.isArray((payload as BrazeCurrentsPayload).events);
  }
}
