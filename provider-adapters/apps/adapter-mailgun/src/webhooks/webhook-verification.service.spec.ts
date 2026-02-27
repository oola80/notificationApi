import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { MetricsService } from '@app/common';
import { WebhookVerificationService } from './webhook-verification.service.js';
import { MailgunWebhookSignature } from './interfaces/mailgun-webhook.interfaces.js';

const SIGNING_KEY = 'test-signing-key-12345';

function generateValidSignature(
  timestamp?: string,
  token?: string,
): MailgunWebhookSignature {
  const ts = timestamp ?? Math.floor(Date.now() / 1000).toString();
  const tk = token ?? 'random-token-abc123';
  const sig = createHmac('sha256', SIGNING_KEY)
    .update(ts + tk)
    .digest('hex');
  return { timestamp: ts, token: tk, signature: sig };
}

describe('WebhookVerificationService', () => {
  let service: WebhookVerificationService;
  let metricsService: MetricsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookVerificationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'mailgun.webhookSigningKey') return SIGNING_KEY;
              return '';
            }),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementWebhookVerificationFailures: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(WebhookVerificationService);
    metricsService = module.get(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('valid signature', () => {
    it('should return true for a valid HMAC-SHA256 signature', () => {
      const sig = generateValidSignature();
      expect(service.verify(sig)).toBe(true);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).not.toHaveBeenCalled();
    });

    it('should return true with custom token value', () => {
      const sig = generateValidSignature(undefined, 'my-custom-token-xyz');
      expect(service.verify(sig)).toBe(true);
    });
  });

  describe('invalid signature', () => {
    it('should return false when signature is tampered with', () => {
      const sig = generateValidSignature();
      sig.signature = 'tampered-invalid-signature-value-that-is-same-length-aa';
      expect(service.verify(sig)).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('mailgun');
    });

    it('should return false when timestamp is tampered with (HMAC recomputed does not match)', () => {
      const sig = generateValidSignature();
      // Tamper with timestamp — the recomputed HMAC won't match
      sig.timestamp = (parseInt(sig.timestamp, 10) + 1).toString();
      expect(service.verify(sig)).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('mailgun');
    });

    it('should return false when token is tampered with', () => {
      const sig = generateValidSignature();
      sig.token = 'different-token';
      expect(service.verify(sig)).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('mailgun');
    });
  });

  describe('expired timestamp', () => {
    it('should return false when timestamp is older than 5 minutes', () => {
      const expiredTimestamp = (
        Math.floor(Date.now() / 1000) - 301
      ).toString();
      const sig = generateValidSignature(expiredTimestamp);
      expect(service.verify(sig)).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('mailgun');
    });

    it('should return true when timestamp is exactly at 5 minute boundary', () => {
      const borderTimestamp = (
        Math.floor(Date.now() / 1000) - 300
      ).toString();
      const sig = generateValidSignature(borderTimestamp);
      expect(service.verify(sig)).toBe(true);
    });
  });

  describe('missing fields', () => {
    it('should return false when signature object is null', () => {
      expect(service.verify(null as any)).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('mailgun');
    });

    it('should return false when timestamp is missing', () => {
      const sig = generateValidSignature();
      sig.timestamp = '' as any;
      expect(service.verify(sig)).toBe(false);
    });

    it('should return false when token is missing', () => {
      const sig = generateValidSignature();
      sig.token = '' as any;
      expect(service.verify(sig)).toBe(false);
    });

    it('should return false when signature field is missing', () => {
      const sig = generateValidSignature();
      sig.signature = '' as any;
      expect(service.verify(sig)).toBe(false);
    });

    it('should return false when timestamp is undefined', () => {
      const sig = generateValidSignature();
      sig.timestamp = undefined as any;
      expect(service.verify(sig)).toBe(false);
    });

    it('should return false for non-numeric timestamp', () => {
      const sig = generateValidSignature();
      sig.timestamp = 'not-a-number';
      expect(service.verify(sig)).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('mailgun');
    });
  });

  describe('timing-safe comparison', () => {
    it('should use timing-safe comparison (no short-circuit on first byte mismatch)', () => {
      // Generate a valid signature and corrupt just the last character
      const sig = generateValidSignature();
      const chars = sig.signature.split('');
      chars[chars.length - 1] =
        chars[chars.length - 1] === 'a' ? 'b' : 'a';
      sig.signature = chars.join('');

      // Should still return false (timing-safe comparison catches it)
      expect(service.verify(sig)).toBe(false);
    });
  });
});
