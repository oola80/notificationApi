import { Test, TestingModule } from '@nestjs/testing';
import { HttpException } from '@nestjs/common';
import {
  MetricsService,
  RabbitMQPublisherService,
  WebhookEventDto,
  WebhookEventType,
} from '@app/common';
import { WebhooksService } from './webhooks.service.js';
import { WebhookVerificationService } from './webhook-verification.service.js';
import { WebhookNormalizerService } from './webhook-normalizer.service.js';
import { MailgunWebhookPayload } from './interfaces/mailgun-webhook.interfaces.js';

function buildPayload(): MailgunWebhookPayload {
  return {
    signature: {
      timestamp: Math.floor(Date.now() / 1000).toString(),
      token: 'test-token',
      signature: 'valid-sig',
    },
    'event-data': {
      event: 'delivered',
      id: 'event-id-123',
      timestamp: Date.now() / 1000,
      message: {
        headers: {
          'message-id': '<abc123@distelsa.info>',
          to: 'user@example.com',
          from: 'notifications@distelsa.info',
          subject: 'Test',
        },
      },
      recipient: 'user@example.com',
      'user-variables': {
        notificationId: 'notif-001',
        correlationId: 'corr-002',
        cycleId: 'cycle-003',
      },
    },
  };
}

function buildNormalizedEvent(): WebhookEventDto {
  return {
    providerId: 'mailgun',
    providerName: 'Mailgun',
    providerMessageId: '<abc123@distelsa.info>',
    eventType: WebhookEventType.DELIVERED,
    rawStatus: 'delivered',
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: WebhookVerificationService,
          useValue: {
            verify: jest.fn().mockReturnValue(true),
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
      ],
    }).compile();

    service = module.get(WebhooksService);
    verificationService = module.get(WebhookVerificationService);
    normalizerService = module.get(WebhookNormalizerService);
    publisherService = module.get(RabbitMQPublisherService);
    metricsService = module.get(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('happy path', () => {
    it('should verify, normalize, publish, and record metrics', async () => {
      const payload = buildPayload();
      await service.processWebhook(payload);

      expect(verificationService.verify).toHaveBeenCalledWith(
        payload.signature,
      );
      expect(normalizerService.normalize).toHaveBeenCalledWith(payload);
      expect(publisherService.publishWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'mailgun',
          eventType: WebhookEventType.DELIVERED,
        }),
      );
      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledWith(
        'mailgun',
        'delivered',
      );
    });
  });

  describe('invalid signature', () => {
    it('should throw HttpException 401 with MG-004 on verification failure', async () => {
      (verificationService.verify as jest.Mock).mockReturnValue(false);

      const payload = buildPayload();
      await expect(service.processWebhook(payload)).rejects.toThrow(
        HttpException,
      );

      try {
        await service.processWebhook(payload);
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const response = (error as HttpException).getResponse() as any;
        expect(response.code).toBe('MG-004');
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

      const payload = buildPayload();
      // Should NOT throw — fire-and-forget
      await expect(service.processWebhook(payload)).resolves.toBeUndefined();

      expect(metricsService.incrementRabbitmqPublish).toHaveBeenCalledWith(
        'mailgun',
        'failed',
      );
      // Metrics for received event should still be incremented
      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledWith(
        'mailgun',
        'delivered',
      );
    });
  });

  describe('metrics', () => {
    it('should increment adapter_webhook_received_total with correct labels', async () => {
      const event = buildNormalizedEvent();
      event.eventType = WebhookEventType.OPENED;
      (normalizerService.normalize as jest.Mock).mockReturnValue(event);

      await service.processWebhook(buildPayload());

      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledWith(
        'mailgun',
        'opened',
      );
    });
  });

  describe('RabbitMQ routing', () => {
    it('should publish with the correct WebhookEventDto', async () => {
      const event = buildNormalizedEvent();
      (normalizerService.normalize as jest.Mock).mockReturnValue(event);

      await service.processWebhook(buildPayload());

      expect(publisherService.publishWebhookEvent).toHaveBeenCalledWith(event);
    });
  });
});
