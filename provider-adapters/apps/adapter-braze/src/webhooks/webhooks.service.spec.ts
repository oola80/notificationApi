import { Test, TestingModule } from '@nestjs/testing';
import {
  MetricsService,
  RabbitMQPublisherService,
  WebhookEventDto,
  WebhookEventType,
} from '@app/common';
import { WebhooksService } from './webhooks.service.js';
import { WebhookVerificationService } from './webhook-verification.service.js';
import { WebhookNormalizerService } from './webhook-normalizer.service.js';
import type {
  BrazePostbackPayload,
  BrazeCurrentsPayload,
} from './interfaces/braze-webhook.interfaces.js';

const VALID_KEY = 'valid-webhook-key';

function buildPostback(
  overrides: Partial<BrazePostbackPayload> = {},
): BrazePostbackPayload {
  return {
    event_type: 'users.messages.email.Delivery',
    dispatch_id: 'dispatch-123',
    email_address: 'user@example.com',
    timestamp: '2026-03-09T12:00:00Z',
    key_value_pairs: { notificationId: 'notif-001' },
    ...overrides,
  };
}

function buildCurrentsBatch(count = 2): BrazeCurrentsPayload {
  return {
    events: Array.from({ length: count }, (_, i) => ({
      event_type: 'users.messages.email.Delivery',
      dispatch_id: `dispatch-c${i}`,
      email_address: `user${i}@example.com`,
      timestamp: 1741521600 + i,
      properties: { notificationId: `notif-c${i}` },
    })),
  };
}

function buildNormalizedEvent(
  overrides: Partial<WebhookEventDto> = {},
): WebhookEventDto {
  return {
    providerId: 'braze',
    providerName: 'Braze',
    providerMessageId: 'dispatch-123',
    eventType: WebhookEventType.DELIVERED,
    rawStatus: 'users.messages.email.Delivery',
    notificationId: 'notif-001',
    correlationId: null as any,
    cycleId: null as any,
    recipientAddress: 'user@example.com',
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides,
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
            normalizePostback: jest
              .fn()
              .mockReturnValue(buildNormalizedEvent()),
            normalizeCurrentsEvent: jest
              .fn()
              .mockReturnValue(buildNormalizedEvent()),
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

  describe('happy path — postback', () => {
    it('should verify, normalize, publish, and record metrics', async () => {
      const payload = buildPostback();
      await service.processWebhook(VALID_KEY, payload);

      expect(verificationService.verify).toHaveBeenCalledWith(VALID_KEY);
      expect(normalizerService.normalizePostback).toHaveBeenCalledWith(
        payload,
      );
      expect(publisherService.publishWebhookEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: 'braze',
          eventType: WebhookEventType.DELIVERED,
        }),
      );
      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledWith(
        'braze',
        'delivered',
      );
    });
  });

  describe('verification failure', () => {
    it('should not normalize or publish when verification fails', async () => {
      (verificationService.verify as jest.Mock).mockReturnValue(false);

      const payload = buildPostback();
      // Should NOT throw — always resolves
      await expect(
        service.processWebhook(VALID_KEY, payload),
      ).resolves.toBeUndefined();

      expect(normalizerService.normalizePostback).not.toHaveBeenCalled();
      expect(publisherService.publishWebhookEvent).not.toHaveBeenCalled();
      expect(metricsService.incrementWebhookReceived).not.toHaveBeenCalled();
    });
  });

  describe('batch Currents events', () => {
    it('should process all events in a Currents batch', async () => {
      const batch = buildCurrentsBatch(3);
      await service.processWebhook(VALID_KEY, batch);

      expect(verificationService.verify).toHaveBeenCalledWith(VALID_KEY);
      expect(normalizerService.normalizeCurrentsEvent).toHaveBeenCalledTimes(
        3,
      );
      expect(publisherService.publishWebhookEvent).toHaveBeenCalledTimes(3);
      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledTimes(
        3,
      );
    });

    it('should skip events that normalize to null (unknown types)', async () => {
      (normalizerService.normalizeCurrentsEvent as jest.Mock)
        .mockReturnValueOnce(buildNormalizedEvent())
        .mockReturnValueOnce(null) // unknown event
        .mockReturnValueOnce(buildNormalizedEvent());

      const batch = buildCurrentsBatch(3);
      await service.processWebhook(VALID_KEY, batch);

      expect(publisherService.publishWebhookEvent).toHaveBeenCalledTimes(2);
      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledTimes(
        2,
      );
    });
  });

  describe('RabbitMQ publish failure', () => {
    it('should log error and increment failed metric but still resolve (postback)', async () => {
      (publisherService.publishWebhookEvent as jest.Mock).mockImplementation(
        () => {
          throw new Error('RabbitMQ connection lost');
        },
      );

      const payload = buildPostback();
      await expect(
        service.processWebhook(VALID_KEY, payload),
      ).resolves.toBeUndefined();

      expect(metricsService.incrementRabbitmqPublish).toHaveBeenCalledWith(
        'braze',
        'failed',
      );
      // Metrics for received event should still be incremented
      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledWith(
        'braze',
        'delivered',
      );
    });

    it('should continue processing batch when individual publish fails', async () => {
      (publisherService.publishWebhookEvent as jest.Mock)
        .mockImplementationOnce(() => {
          throw new Error('publish error');
        })
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {});

      const batch = buildCurrentsBatch(3);
      await service.processWebhook(VALID_KEY, batch);

      expect(publisherService.publishWebhookEvent).toHaveBeenCalledTimes(3);
      expect(metricsService.incrementRabbitmqPublish).toHaveBeenCalledWith(
        'braze',
        'failed',
      );
      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledTimes(
        3,
      );
    });
  });

  describe('unknown postback event type', () => {
    it('should not publish when normalizer returns null', async () => {
      (normalizerService.normalizePostback as jest.Mock).mockReturnValue(
        null,
      );

      const payload = buildPostback({
        event_type: 'users.messages.email.Unknown',
      });
      await service.processWebhook(VALID_KEY, payload);

      expect(publisherService.publishWebhookEvent).not.toHaveBeenCalled();
      expect(metricsService.incrementWebhookReceived).not.toHaveBeenCalled();
    });
  });

  describe('empty Currents batch', () => {
    it('should handle empty events array gracefully', async () => {
      const batch: BrazeCurrentsPayload = { events: [] };
      await service.processWebhook(VALID_KEY, batch);

      expect(normalizerService.normalizeCurrentsEvent).not.toHaveBeenCalled();
      expect(publisherService.publishWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('metrics', () => {
    it('should increment adapter_webhook_received_total with correct labels', async () => {
      const event = buildNormalizedEvent({
        eventType: WebhookEventType.OPENED,
      });
      (normalizerService.normalizePostback as jest.Mock).mockReturnValue(
        event,
      );

      await service.processWebhook(VALID_KEY, buildPostback());

      expect(metricsService.incrementWebhookReceived).toHaveBeenCalledWith(
        'braze',
        'opened',
      );
    });
  });
});
