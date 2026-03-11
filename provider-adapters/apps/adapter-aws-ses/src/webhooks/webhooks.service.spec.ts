import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { of } from 'rxjs';
import {
  MetricsService,
  RabbitMQPublisherService,
  WebhookEventDto,
  WebhookEventType,
} from '@app/common';
import { WebhooksService } from './webhooks.service.js';
import { WebhookVerificationService } from './webhook-verification.service.js';
import { WebhookNormalizerService } from './webhook-normalizer.service.js';
import type { SnsMessage } from './interfaces/ses-webhook.interfaces.js';

function buildSnsNotification(
  overrides: Partial<SnsMessage> = {},
): SnsMessage {
  return {
    Type: 'Notification',
    MessageId: 'sns-msg-id-123',
    TopicArn: 'arn:aws:sns:us-east-1:123456789:ses-notifications',
    Message: JSON.stringify({
      eventType: 'Delivery',
      mail: {
        messageId: 'ses-mail-id-456',
        timestamp: '2024-01-31T12:00:00.000Z',
        source: 'notifications@example.com',
        destination: ['user@example.com'],
        headers: [
          { name: 'X-Notification-Id', value: 'notif-001' },
          { name: 'X-Correlation-Id', value: 'corr-002' },
          { name: 'X-Cycle-Id', value: 'cycle-003' },
        ],
      },
      delivery: {
        timestamp: '2024-01-31T12:00:01.000Z',
        processingTimeMillis: 500,
        recipients: ['user@example.com'],
        smtpResponse: '250 OK',
        reportingMTA: 'a1-2.smtp-out.us-east-1.amazonses.com',
      },
    }),
    Timestamp: '2024-01-31T12:00:00.000Z',
    SignatureVersion: '1',
    Signature: 'valid-sig',
    SigningCertURL:
      'https://sns.us-east-1.amazonaws.com/cert.pem',
    ...overrides,
  };
}

function buildSubscriptionConfirmation(): SnsMessage {
  return {
    Type: 'SubscriptionConfirmation',
    MessageId: 'sns-sub-id-789',
    TopicArn: 'arn:aws:sns:us-east-1:123456789:ses-notifications',
    Message: 'You have chosen to subscribe to the topic...',
    Timestamp: '2024-01-31T12:00:00.000Z',
    SignatureVersion: '1',
    Signature: 'valid-sig',
    SigningCertURL:
      'https://sns.us-east-1.amazonaws.com/cert.pem',
    SubscribeURL:
      'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=arn:aws:sns:us-east-1:123456789:ses-notifications&Token=abc123',
    Token: 'abc123',
  };
}

function buildNormalizedEvent(): WebhookEventDto {
  return {
    providerId: 'aws-ses',
    providerName: 'Amazon SES',
    providerMessageId: 'ses-mail-id-456',
    eventType: WebhookEventType.DELIVERED,
    rawStatus: 'Delivery',
    notificationId: 'notif-001',
    correlationId: 'corr-002',
    cycleId: 'cycle-003',
    recipientAddress: 'user@example.com',
    timestamp: new Date().toISOString(),
    metadata: {},
  };
}

describe('WebhooksService', () => {
  let service: WebhooksService;
  let verificationService: WebhookVerificationService;
  let normalizerService: WebhookNormalizerService;
  let publisherService: RabbitMQPublisherService;
  let metricsService: MetricsService;
  let httpService: HttpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: WebhookVerificationService,
          useValue: {
            verify: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: WebhookNormalizerService,
          useValue: {
            normalize: jest.fn().mockReturnValue(buildNormalizedEvent()),
          },
        },
        {
          provide: RabbitMQPublisherService,
          useValue: {
            publishWebhookEvent: jest.fn(),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementWebhookReceived: jest.fn(),
            incrementWebhookVerificationFailures: jest.fn(),
            incrementRabbitmqPublish: jest.fn(),
          },
        },
        {
          provide: HttpService,
          useValue: {
            get: jest.fn().mockReturnValue(of({ data: 'OK', status: 200 })),
          },
        },
      ],
    }).compile();

    service = module.get(WebhooksService);
    verificationService = module.get(WebhookVerificationService);
    normalizerService = module.get(WebhookNormalizerService);
    publisherService = module.get(RabbitMQPublisherService);
    metricsService = module.get(MetricsService);
    httpService = module.get(HttpService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('SubscriptionConfirmation', () => {
    it('should auto-confirm by calling SubscribeURL', async () => {
      const message = buildSubscriptionConfirmation();

      await service.processWebhook(message);

      expect(verificationService.verify).toHaveBeenCalledWith(message);
      expect(httpService.get).toHaveBeenCalledWith(
        message.SubscribeURL,
        { timeout: 5000 },
      );
      // Should NOT publish to RabbitMQ
      expect(publisherService.publishWebhookEvent).not.toHaveBeenCalled();
    });

    it('should not crash when SubscribeURL is missing', async () => {
      const message = buildSubscriptionConfirmation();
      delete (message as any).SubscribeURL;

      await expect(service.processWebhook(message)).resolves.toBeUndefined();
      expect(httpService.get).not.toHaveBeenCalled();
    });
  });

  describe('UnsubscribeConfirmation', () => {
    it('should log warning and not publish to RabbitMQ', async () => {
      const message = buildSnsNotification({
        Type: 'UnsubscribeConfirmation',
      });

      await service.processWebhook(message);

      expect(publisherService.publishWebhookEvent).not.toHaveBeenCalled();
      expect(metricsService.incrementWebhookReceived).not.toHaveBeenCalled();
    });
  });

  describe('Notification processing', () => {
    it('should verify, normalize, publish, and record metrics', async () => {
      const message = buildSnsNotification();

      await service.processWebhook(message);

      expect(verificationService.verify).toHaveBeenCalledWith(message);
      expect(normalizerService.normalize).toHaveBeenCalled();
      expect(publisherService.publishWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'aws-ses',
          eventType: WebhookEventType.DELIVERED,
        }),
      );
      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledWith(
        'aws-ses',
        'delivered',
      );
    });

    it('should not throw when Message JSON is invalid', async () => {
      const message = buildSnsNotification({
        Message: 'not-valid-json{{{',
      });

      await expect(service.processWebhook(message)).resolves.toBeUndefined();
      expect(publisherService.publishWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('verification failure', () => {
    it('should throw HttpException 401 with SES-009 on verification failure', async () => {
      (verificationService.verify as jest.Mock).mockResolvedValue(false);

      const message = buildSnsNotification();
      await expect(service.processWebhook(message)).rejects.toThrow(
        HttpException,
      );

      try {
        await service.processWebhook(message);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('SES-009');
        expect(response.status).toBe(401);
      }

      // Should not proceed to normalize or publish
      expect(normalizerService.normalize).not.toHaveBeenCalled();
      expect(publisherService.publishWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('RabbitMQ publish failure', () => {
    it('should log error and increment failed metric but still resolve', async () => {
      (publisherService.publishWebhookEvent as jest.Mock).mockImplementation(
        () => {
          throw new Error('RabbitMQ connection lost');
        },
      );

      const message = buildSnsNotification();
      // Should NOT throw — fire-and-forget
      await expect(service.processWebhook(message)).resolves.toBeUndefined();

      expect(metricsService.incrementRabbitmqPublish).toHaveBeenCalledWith(
        'aws-ses',
        'failed',
      );
      // Metrics for received event should still be incremented
      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledWith(
        'aws-ses',
        'delivered',
      );
    });
  });

  describe('metrics', () => {
    it('should increment adapter_webhook_received_total with correct labels', async () => {
      const event = buildNormalizedEvent();
      event.eventType = WebhookEventType.OPENED;
      (normalizerService.normalize as jest.Mock).mockReturnValue(event);

      await service.processWebhook(buildSnsNotification());

      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledWith(
        'aws-ses',
        'opened',
      );
    });
  });
});
