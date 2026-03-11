import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  createErrorResponse,
  MetricsService,
  RabbitMQPublisherService,
} from '@app/common';
import { SES_ERROR_CODES } from '../errors/ses-errors.js';
import { WebhookVerificationService } from './webhook-verification.service.js';
import { WebhookNormalizerService } from './webhook-normalizer.service.js';
import type {
  SnsMessage,
  SesNotification,
} from './interfaces/ses-webhook.interfaces.js';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly verificationService: WebhookVerificationService,
    private readonly normalizerService: WebhookNormalizerService,
    private readonly publisherService: RabbitMQPublisherService,
    private readonly metricsService: MetricsService,
    private readonly httpService: HttpService,
  ) {}

  async processWebhook(snsMessage: SnsMessage): Promise<void> {
    // Step 1: Verify SNS signature
    const isValid = await this.verificationService.verify(snsMessage);
    if (!isValid) {
      throw createErrorResponse(
        'SES-009',
        SES_ERROR_CODES,
        'SNS signature verification failed',
      );
    }

    // Step 2: Handle message type
    switch (snsMessage.Type) {
      case 'SubscriptionConfirmation':
        await this.handleSubscriptionConfirmation(snsMessage);
        return;

      case 'UnsubscribeConfirmation':
        this.logger.warn(
          `Received UnsubscribeConfirmation for topic: ${snsMessage.TopicArn}`,
        );
        return;

      case 'Notification':
        await this.handleNotification(snsMessage);
        return;

      default:
        this.logger.warn(
          `Unknown SNS message type: ${snsMessage.Type}`,
        );
        return;
    }
  }

  private async handleSubscriptionConfirmation(
    snsMessage: SnsMessage,
  ): Promise<void> {
    if (!snsMessage.SubscribeURL) {
      this.logger.warn(
        'SubscriptionConfirmation missing SubscribeURL — cannot auto-confirm',
      );
      return;
    }

    try {
      await firstValueFrom(
        this.httpService.get(snsMessage.SubscribeURL, { timeout: 5000 }),
      );
      this.logger.log(
        `Auto-confirmed SNS subscription for topic: ${snsMessage.TopicArn}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to auto-confirm SNS subscription: ${(error as Error).message}`,
      );
    }
  }

  private async handleNotification(snsMessage: SnsMessage): Promise<void> {
    // Parse the inner SES event from the Message field
    let notification: SesNotification;
    try {
      notification = JSON.parse(snsMessage.Message) as SesNotification;
    } catch (error) {
      this.logger.error(
        `Failed to parse SES notification from SNS Message: ${(error as Error).message}`,
      );
      return;
    }

    // Normalize to WebhookEventDto
    const event = this.normalizerService.normalize(notification);

    // Publish to RabbitMQ (fire-and-forget)
    try {
      this.publisherService.publishWebhookEvent(event);
    } catch (error) {
      this.logger.error(
        `Failed to publish webhook event to RabbitMQ: ${(error as Error).message}`,
      );
      this.metricsService.incrementRabbitmqPublish('aws-ses', 'failed');
      // Don't throw — fire-and-forget pattern
    }

    // Record metrics
    this.metricsService.incrementWebhookReceived('aws-ses', event.eventType);

    this.logger.log(
      `Processed SES webhook: ${event.eventType} for ${event.providerMessageId}`,
    );
  }
}
