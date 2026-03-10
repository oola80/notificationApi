import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { MetricsService } from '@app/common';

@Injectable()
export class WebhookVerificationService {
  private readonly logger = new Logger(WebhookVerificationService.name);
  private readonly webhookKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.webhookKey = this.configService.get<string>('braze.webhookKey', '');
  }

  /**
   * Verify a Braze webhook using shared secret comparison.
   * Used for both transactional postbacks (X-Braze-Webhook-Key header)
   * and Currents events (same shared secret mechanism).
   *
   * Uses crypto.timingSafeEqual for constant-time comparison.
   */
  verify(providedKey: string | undefined): boolean {
    try {
      if (!providedKey) {
        this.logger.warn(
          'Webhook verification failed: missing webhook key header',
        );
        this.metricsService.incrementWebhookVerificationFailures('braze');
        return false;
      }

      if (!this.webhookKey) {
        this.logger.warn(
          'Webhook verification failed: BRAZE_WEBHOOK_KEY not configured',
        );
        this.metricsService.incrementWebhookVerificationFailures('braze');
        return false;
      }

      const providedBuffer = Buffer.from(providedKey, 'utf8');
      const expectedBuffer = Buffer.from(this.webhookKey, 'utf8');

      if (providedBuffer.length !== expectedBuffer.length) {
        this.logger.warn(
          'Webhook verification failed: key length mismatch',
        );
        this.metricsService.incrementWebhookVerificationFailures('braze');
        return false;
      }

      const isValid = timingSafeEqual(providedBuffer, expectedBuffer);

      if (!isValid) {
        this.logger.warn('Webhook verification failed: key mismatch');
        this.metricsService.incrementWebhookVerificationFailures('braze');
      }

      return isValid;
    } catch (error) {
      this.logger.error(
        `Webhook verification error: ${(error as Error).message}`,
      );
      this.metricsService.incrementWebhookVerificationFailures('braze');
      return false;
    }
  }
}
