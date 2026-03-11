import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { MetricsService } from '@app/common';
import { WebhookVerificationService } from './webhook-verification.service.js';
import type { SnsMessage } from './interfaces/ses-webhook.interfaces.js';
import { createSign, generateKeyPairSync } from 'crypto';

// Generate a test RSA key pair for signing
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});

// Export PEM for use as the public key in verification
const testPublicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

function buildSnsMessage(
  overrides: Partial<SnsMessage> = {},
): SnsMessage {
  return {
    Type: 'Notification',
    MessageId: 'msg-id-123',
    TopicArn: 'arn:aws:sns:us-east-1:123456789:ses-notifications',
    Message: '{"eventType":"Delivery","mail":{"messageId":"test-123"}}',
    Timestamp: '2024-01-31T12:00:00.000Z',
    SignatureVersion: '1' as const,
    Signature: '',
    SigningCertURL:
      'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc123.pem',
    ...overrides,
  };
}

function signMessage(
  message: SnsMessage,
  algorithm: string = 'RSA-SHA1',
): string {
  const service = new WebhookVerificationService(
    {} as any,
    { incrementWebhookVerificationFailures: jest.fn() } as any,
  );
  const stringToSign = service.buildStringToSign(message);
  const signer = createSign(algorithm);
  signer.update(stringToSign);
  return signer.sign(privateKey, 'base64');
}

describe('WebhookVerificationService', () => {
  let service: WebhookVerificationService;
  let metricsService: MetricsService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookVerificationService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn().mockReturnValue(
              of({ data: testPublicKeyPem, status: 200 }),
            ),
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
    httpService = module.get(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('valid signature (SignatureVersion 1 — SHA1)', () => {
    it('should return true for a valid SHA1 signature', async () => {
      const message = buildSnsMessage({ SignatureVersion: '1' });
      message.Signature = signMessage(message, 'RSA-SHA1');

      const result = await service.verify(message);
      expect(result).toBe(true);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).not.toHaveBeenCalled();
    });
  });

  describe('valid signature (SignatureVersion 2 — SHA256)', () => {
    it('should return true for a valid SHA256 signature', async () => {
      const message = buildSnsMessage({ SignatureVersion: '2' });
      message.Signature = signMessage(message, 'RSA-SHA256');

      const result = await service.verify(message);
      expect(result).toBe(true);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).not.toHaveBeenCalled();
    });
  });

  describe('invalid signature', () => {
    it('should return false when signature is tampered with', async () => {
      const message = buildSnsMessage({ SignatureVersion: '1' });
      message.Signature = 'dGFtcGVyZWQtc2lnbmF0dXJl'; // base64 of "tampered-signature"

      const result = await service.verify(message);
      expect(result).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('aws-ses');
    });

    it('should return false when message content is tampered', async () => {
      const message = buildSnsMessage({ SignatureVersion: '1' });
      message.Signature = signMessage(message, 'RSA-SHA1');
      // Tamper with message after signing
      message.Message = '{"eventType":"Bounce","mail":{"messageId":"tampered"}}';

      const result = await service.verify(message);
      expect(result).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('aws-ses');
    });
  });

  describe('invalid cert URL — domain', () => {
    it('should return false when SigningCertURL is from a non-SNS domain', async () => {
      const message = buildSnsMessage({
        SigningCertURL: 'https://evil.example.com/cert.pem',
      });
      message.Signature = signMessage(message, 'RSA-SHA1');

      const result = await service.verify(message);
      expect(result).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('aws-ses');
    });

    it('should return false when cert URL has no SNS subdomain', async () => {
      const message = buildSnsMessage({
        SigningCertURL: 'https://amazonaws.com/cert.pem',
      });
      message.Signature = signMessage(message, 'RSA-SHA1');

      const result = await service.verify(message);
      expect(result).toBe(false);
    });
  });

  describe('invalid cert URL — protocol', () => {
    it('should return false when SigningCertURL uses HTTP (not HTTPS)', async () => {
      const message = buildSnsMessage({
        SigningCertURL:
          'http://sns.us-east-1.amazonaws.com/SimpleNotificationService-abc.pem',
      });
      message.Signature = signMessage(message, 'RSA-SHA1');

      const result = await service.verify(message);
      expect(result).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('aws-ses');
    });
  });

  describe('certificate caching', () => {
    it('should cache the certificate after first download', async () => {
      const message = buildSnsMessage({ SignatureVersion: '1' });
      message.Signature = signMessage(message, 'RSA-SHA1');

      await service.verify(message);
      await service.verify(message);

      // httpService.get should only be called once (cached)
      expect(httpService.get).toHaveBeenCalledTimes(1);
    });

    it('should download again for different cert URLs', async () => {
      const message1 = buildSnsMessage({
        SigningCertURL:
          'https://sns.us-east-1.amazonaws.com/cert1.pem',
        SignatureVersion: '1',
      });
      message1.Signature = signMessage(message1, 'RSA-SHA1');

      const message2 = buildSnsMessage({
        SigningCertURL:
          'https://sns.us-east-1.amazonaws.com/cert2.pem',
        SignatureVersion: '1',
      });
      message2.Signature = signMessage(message2, 'RSA-SHA1');

      await service.verify(message1);
      await service.verify(message2);

      expect(httpService.get).toHaveBeenCalledTimes(2);
    });

    it('should return false when certificate download fails', async () => {
      (httpService.get as jest.Mock).mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      const message = buildSnsMessage({ SignatureVersion: '1' });
      message.Signature = signMessage(message, 'RSA-SHA1');

      const result = await service.verify(message);
      expect(result).toBe(false);
      expect(
        metricsService.incrementWebhookVerificationFailures,
      ).toHaveBeenCalledWith('aws-ses');
    });
  });

  describe('string-to-sign for different message types', () => {
    it('should build correct string-to-sign for Notification type', () => {
      const message = buildSnsMessage({
        Type: 'Notification',
        Message: 'test message',
        MessageId: 'msg-001',
        Timestamp: '2024-01-01T00:00:00.000Z',
        TopicArn: 'arn:aws:sns:us-east-1:123:topic',
      });

      const result = service.buildStringToSign(message);
      expect(result).toBe(
        'Message\ntest message\nMessageId\nmsg-001\nTimestamp\n2024-01-01T00:00:00.000Z\nTopicArn\narn:aws:sns:us-east-1:123:topic\nType\nNotification\n',
      );
    });

    it('should include Subject in Notification string-to-sign when present', () => {
      const message = buildSnsMessage({
        Type: 'Notification',
        Subject: 'My Subject',
        Message: 'test',
        MessageId: 'msg-002',
        Timestamp: '2024-01-01T00:00:00.000Z',
        TopicArn: 'arn:aws:sns:us-east-1:123:topic',
      });

      const result = service.buildStringToSign(message);
      expect(result).toContain('Subject\nMy Subject\n');
    });

    it('should build correct string-to-sign for SubscriptionConfirmation type', () => {
      const message = buildSnsMessage({
        Type: 'SubscriptionConfirmation',
        Message: 'confirm',
        MessageId: 'msg-003',
        SubscribeURL: 'https://sns.amazonaws.com/confirm?token=abc',
        Timestamp: '2024-01-01T00:00:00.000Z',
        Token: 'confirm-token',
        TopicArn: 'arn:aws:sns:us-east-1:123:topic',
      });

      const result = service.buildStringToSign(message);
      expect(result).toBe(
        'Message\nconfirm\nMessageId\nmsg-003\nSubscribeURL\nhttps://sns.amazonaws.com/confirm?token=abc\nTimestamp\n2024-01-01T00:00:00.000Z\nToken\nconfirm-token\nTopicArn\narn:aws:sns:us-east-1:123:topic\nType\nSubscriptionConfirmation\n',
      );
    });

    it('should build correct string-to-sign for UnsubscribeConfirmation type', () => {
      const message = buildSnsMessage({
        Type: 'UnsubscribeConfirmation',
        Message: 'unsubscribe',
        MessageId: 'msg-004',
        SubscribeURL: 'https://sns.amazonaws.com/unsubscribe',
        Timestamp: '2024-01-01T00:00:00.000Z',
        Token: 'unsub-token',
        TopicArn: 'arn:aws:sns:us-east-1:123:topic',
      });

      const result = service.buildStringToSign(message);
      expect(result).toContain('SubscribeURL\nhttps://sns.amazonaws.com/unsubscribe\n');
      expect(result).toContain('Token\nunsub-token\n');
      expect(result).toContain('Type\nUnsubscribeConfirmation\n');
    });
  });

  describe('isValidCertUrl', () => {
    it('should accept valid SNS cert URLs', () => {
      expect(
        service.isValidCertUrl(
          'https://sns.us-east-1.amazonaws.com/cert.pem',
        ),
      ).toBe(true);
    });

    it('should accept SNS cert URLs from China region', () => {
      expect(
        service.isValidCertUrl(
          'https://sns.cn-north-1.amazonaws.com.cn/cert.pem',
        ),
      ).toBe(true);
    });

    it('should reject empty URL', () => {
      expect(service.isValidCertUrl('')).toBe(false);
    });

    it('should reject HTTP URLs', () => {
      expect(
        service.isValidCertUrl(
          'http://sns.us-east-1.amazonaws.com/cert.pem',
        ),
      ).toBe(false);
    });

    it('should reject non-SNS domain', () => {
      expect(
        service.isValidCertUrl('https://evil.example.com/cert.pem'),
      ).toBe(false);
    });
  });
});
