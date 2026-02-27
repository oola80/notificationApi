import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { MetricsService } from '@app/common';
import { MailgunWebhookSignature } from './interfaces/mailgun-webhook.interfaces.js';

const REPLAY_WINDOW_SECONDS = 300; // 5 minutes

@Injectable()
export class WebhookVerificationService {
  private readonly logger = new Logger(WebhookVerificationService.name);
  private readonly signingKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.signingKey = this.configService.get<string>(
      'mailgun.webhookSigningKey',
      '',
    );
  }

  verify(signatureObj: MailgunWebhookSignature): boolean {
    try {
      if (
        !signatureObj ||
        !signatureObj.timestamp ||
        !signatureObj.token ||
        !signatureObj.signature
      ) {
        this.logger.warn('Webhook verification failed: missing signature fields');
        this.metricsService.incrementWebhookVerificationFailures('mailgun');
        return false;
      }

      // Replay protection: reject timestamps older than 5 minutes
      const timestampSeconds = parseInt(signatureObj.timestamp, 10);
      if (isNaN(timestampSeconds)) {
        this.logger.warn('Webhook verification failed: invalid timestamp');
        this.metricsService.incrementWebhookVerificationFailures('mailgun');
        return false;
      }

      const nowSeconds = Math.floor(Date.now() / 1000);
      if (nowSeconds - timestampSeconds > REPLAY_WINDOW_SECONDS) {
        this.logger.warn(
          `Webhook verification failed: timestamp expired (age=${nowSeconds - timestampSeconds}s)`,
        );
        this.metricsService.incrementWebhookVerificationFailures('mailgun');
        return false;
      }

      // Compute HMAC-SHA256: concatenate timestamp + token, sign with key
      const data = signatureObj.timestamp + signatureObj.token;
      const computedHmac = createHmac('sha256', this.signingKey)
        .update(data)
        .digest('hex');

      // Timing-safe comparison
      const computedBuffer = Buffer.from(computedHmac, 'utf8');
      const receivedBuffer = Buffer.from(signatureObj.signature, 'utf8');

      if (computedBuffer.length !== receivedBuffer.length) {
        this.logger.warn('Webhook verification failed: signature length mismatch');
        this.metricsService.incrementWebhookVerificationFailures('mailgun');
        return false;
      }

      const isValid = timingSafeEqual(computedBuffer, receivedBuffer);

      if (!isValid) {
        this.logger.warn('Webhook verification failed: signature mismatch');
        this.metricsService.incrementWebhookVerificationFailures('mailgun');
      }

      return isValid;
    } catch (error) {
      this.logger.error(
        `Webhook verification error: ${(error as Error).message}`,
      );
      this.metricsService.incrementWebhookVerificationFailures('mailgun');
      return false;
    }
  }
}
