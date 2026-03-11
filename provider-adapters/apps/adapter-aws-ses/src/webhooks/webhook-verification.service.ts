import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { createVerify, X509Certificate } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { MetricsService, createErrorResponse } from '@app/common';
import { SES_ERROR_CODES } from '../errors/ses-errors.js';
import type { SnsMessage } from './interfaces/ses-webhook.interfaces.js';

interface CacheEntry {
  certificate: string;
  cachedAt: number;
}

const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const ALLOWED_CERT_URL_PATTERN =
  /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?\/.*$/;

@Injectable()
export class WebhookVerificationService {
  private readonly logger = new Logger(WebhookVerificationService.name);
  private readonly certCache = new Map<string, CacheEntry>();

  constructor(
    private readonly httpService: HttpService,
    private readonly metricsService: MetricsService,
  ) {}

  async verify(message: SnsMessage): Promise<boolean> {
    try {
      // Step 1: Validate signing cert URL
      if (!this.isValidCertUrl(message.SigningCertURL)) {
        this.logger.warn(
          `SNS verification failed: invalid SigningCertURL "${message.SigningCertURL}"`,
        );
        this.metricsService.incrementWebhookVerificationFailures('aws-ses');
        return false;
      }

      // Step 2: Download/cache the signing certificate
      const certificate = await this.getCertificate(message.SigningCertURL);
      if (!certificate) {
        this.logger.warn(
          'SNS verification failed: could not retrieve signing certificate',
        );
        this.metricsService.incrementWebhookVerificationFailures('aws-ses');
        return false;
      }

      // Step 3: Build the string to sign
      const stringToSign = this.buildStringToSign(message);

      // Step 4: Verify the signature
      const signatureAlgorithm =
        message.SignatureVersion === '2' ? 'SHA256' : 'SHA1';
      const verifier = createVerify(`RSA-${signatureAlgorithm}`);
      verifier.update(stringToSign);

      const isValid = verifier.verify(
        certificate,
        message.Signature,
        'base64',
      );

      if (!isValid) {
        this.logger.warn('SNS verification failed: signature mismatch');
        this.metricsService.incrementWebhookVerificationFailures('aws-ses');
      }

      return isValid;
    } catch (error) {
      this.logger.error(
        `SNS verification error: ${(error as Error).message}`,
      );
      this.metricsService.incrementWebhookVerificationFailures('aws-ses');
      return false;
    }
  }

  isValidCertUrl(url: string): boolean {
    if (!url) return false;

    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      return ALLOWED_CERT_URL_PATTERN.test(url);
    } catch {
      return false;
    }
  }

  buildStringToSign(message: SnsMessage): string {
    if (
      message.Type === 'Notification'
    ) {
      // Notification messages use: Message, MessageId, Subject (if present), Timestamp, TopicArn, Type
      const parts: string[] = [];
      parts.push('Message', message.Message);
      parts.push('MessageId', message.MessageId);
      if (message.Subject !== undefined) {
        parts.push('Subject', message.Subject);
      }
      parts.push('Timestamp', message.Timestamp);
      parts.push('TopicArn', message.TopicArn);
      parts.push('Type', message.Type);
      return parts.join('\n') + '\n';
    }

    // SubscriptionConfirmation and UnsubscribeConfirmation use:
    // Message, MessageId, SubscribeURL, Timestamp, Token, TopicArn, Type
    const parts: string[] = [];
    parts.push('Message', message.Message);
    parts.push('MessageId', message.MessageId);
    parts.push('SubscribeURL', message.SubscribeURL ?? '');
    parts.push('Timestamp', message.Timestamp);
    parts.push('Token', message.Token ?? '');
    parts.push('TopicArn', message.TopicArn);
    parts.push('Type', message.Type);
    return parts.join('\n') + '\n';
  }

  private async getCertificate(url: string): Promise<string | null> {
    // Check cache first
    const cached = this.certCache.get(url);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.certificate;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<string>(url, { timeout: 5000 }),
      );
      const certificate = response.data;

      // Validate it's a PEM certificate or public key
      if (
        !certificate ||
        (!certificate.includes('-----BEGIN CERTIFICATE-----') &&
          !certificate.includes('-----BEGIN PUBLIC KEY-----'))
      ) {
        this.logger.warn(
          'Downloaded certificate does not appear to be a valid PEM certificate',
        );
        return null;
      }

      // Evict oldest entry if cache is full
      if (this.certCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = this.certCache.keys().next().value;
        if (oldestKey) {
          this.certCache.delete(oldestKey);
        }
      }

      this.certCache.set(url, { certificate, cachedAt: Date.now() });
      return certificate;
    } catch (error) {
      this.logger.error(
        `Failed to download SNS signing certificate from ${url}: ${(error as Error).message}`,
      );
      return null;
    }
  }
}
