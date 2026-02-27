import { Test, TestingModule } from '@nestjs/testing';
import { DeliveryPipelineService } from './delivery-pipeline.service.js';
import { ProviderCacheService } from '../providers/provider-cache.service.js';
import { ProviderConfigsRepository } from '../providers/provider-configs.repository.js';
import { ChannelsRepository } from '../channels/channels.repository.js';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service.js';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service.js';
import { RetryService } from '../retry/retry.service.js';
import { MediaProcessorService } from '../media/media-processor.service.js';
import { AdapterClientService } from '../adapter-client/adapter-client.service.js';
import { RabbitMQPublisherService } from '../rabbitmq/rabbitmq-publisher.service.js';
import { FallbackService } from '../fallback/fallback.service.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { DeliveryAttemptsRepository } from './delivery-attempts.repository.js';
import { DispatchMessage } from './interfaces/dispatch-message.interface.js';

describe('DeliveryPipelineService', () => {
  let service: DeliveryPipelineService;
  let providerCacheService: jest.Mocked<ProviderCacheService>;
  let providerConfigsRepo: jest.Mocked<ProviderConfigsRepository>;
  let channelsRepo: jest.Mocked<ChannelsRepository>;
  let circuitBreakerService: jest.Mocked<CircuitBreakerService>;
  let rateLimiterService: jest.Mocked<RateLimiterService>;
  let retryService: jest.Mocked<RetryService>;
  let mediaProcessorService: jest.Mocked<MediaProcessorService>;
  let adapterClientService: jest.Mocked<AdapterClientService>;
  let publisherService: jest.Mocked<RabbitMQPublisherService>;
  let fallbackService: jest.Mocked<FallbackService>;
  let metricsService: jest.Mocked<MetricsService>;
  let deliveryAttemptsRepo: jest.Mocked<DeliveryAttemptsRepository>;

  const mockProvider = {
    id: 'prov-1',
    providerName: 'sendgrid',
    providerId: 'sendgrid-1',
    adapterUrl: 'http://localhost:3170',
    channel: 'email',
    isActive: true,
    routingWeight: 100,
  };

  const mockDispatch: DispatchMessage = {
    notificationId: 'notif-1',
    eventId: 'evt-1',
    ruleId: 'rule-1',
    channel: 'email',
    priority: 'critical',
    recipient: { email: 'test@example.com', name: 'Test User' },
    content: { subject: 'Hello', body: '<p>Body</p>' },
    metadata: { correlationId: 'corr-1', eventType: 'order.created' },
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliveryPipelineService,
        {
          provide: ProviderCacheService,
          useValue: {
            isEnabled: jest.fn().mockReturnValue(true),
            getActiveProvidersByChannel: jest
              .fn()
              .mockReturnValue([mockProvider]),
          },
        },
        {
          provide: ProviderConfigsRepository,
          useValue: {
            findActiveByChannel: jest.fn().mockResolvedValue([mockProvider]),
          },
        },
        {
          provide: ChannelsRepository,
          useValue: {
            findByType: jest.fn().mockResolvedValue({
              id: 'ch-1',
              type: 'email',
              routingMode: 'primary',
              fallbackChannelId: null,
            }),
          },
        },
        {
          provide: CircuitBreakerService,
          useValue: {
            canExecute: jest.fn().mockReturnValue(true),
            recordSuccess: jest.fn(),
            recordFailure: jest.fn(),
          },
        },
        {
          provide: RateLimiterService,
          useValue: {
            acquire: jest.fn().mockResolvedValue({ acquired: true, waitMs: 0 }),
          },
        },
        {
          provide: RetryService,
          useValue: {
            shouldRetry: jest
              .fn()
              .mockReturnValue({ shouldRetry: false, reason: 'Max retries' }),
          },
        },
        {
          provide: MediaProcessorService,
          useValue: {
            processMedia: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: AdapterClientService,
          useValue: {
            send: jest.fn().mockResolvedValue({
              success: true,
              providerMessageId: 'msg-123',
              retryable: false,
              errorMessage: null,
              httpStatus: 200,
              providerResponse: null,
            }),
          },
        },
        {
          provide: RabbitMQPublisherService,
          useValue: {
            publishDeliveryStatus: jest.fn(),
            publishDeliveryAttempt: jest.fn(),
            publishToDlq: jest.fn(),
            publishFallbackDispatch: jest.fn(),
            republishForRetry: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FallbackService,
          useValue: {
            triggerFallback: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: MetricsService,
          useValue: {
            incrementDelivery: jest.fn(),
            incrementAdapterUnavailable: jest.fn(),
            incrementRetry: jest.fn(),
            incrementFallbackTriggered: jest.fn(),
            incrementDlq: jest.fn(),
            observeDeliveryDuration: jest.fn(),
            observeAdapterCallDuration: jest.fn(),
            observeRateLimitWait: jest.fn(),
          },
        },
        {
          provide: DeliveryAttemptsRepository,
          useValue: {
            create: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    service = module.get<DeliveryPipelineService>(DeliveryPipelineService);
    providerCacheService = module.get(ProviderCacheService);
    providerConfigsRepo = module.get(ProviderConfigsRepository);
    channelsRepo = module.get(ChannelsRepository);
    circuitBreakerService = module.get(CircuitBreakerService);
    rateLimiterService = module.get(RateLimiterService);
    retryService = module.get(RetryService);
    mediaProcessorService = module.get(MediaProcessorService);
    adapterClientService = module.get(AdapterClientService);
    publisherService = module.get(RabbitMQPublisherService);
    fallbackService = module.get(FallbackService);
    metricsService = module.get(MetricsService);
    deliveryAttemptsRepo = module.get(DeliveryAttemptsRepository);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('execute - happy path', () => {
    it('should successfully deliver a notification', async () => {
      const result = await service.execute(mockDispatch);

      expect(result.success).toBe(true);
      expect(result.notificationId).toBe('notif-1');
      expect(result.channel).toBe('email');
      expect(result.providerId).toBe('prov-1');
      expect(result.providerName).toBe('sendgrid');
      expect(result.providerMessageId).toBe('msg-123');
      expect(result.attemptNumber).toBe(1);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should record circuit breaker success', async () => {
      await service.execute(mockDispatch);
      expect(circuitBreakerService.recordSuccess).toHaveBeenCalledWith(
        'prov-1',
      );
    });

    it('should publish SENT status', async () => {
      await service.execute(mockDispatch);
      expect(publisherService.publishDeliveryStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: 'notif-1',
          toStatus: 'SENT',
        }),
      );
    });

    it('should publish delivery attempt with sent outcome', async () => {
      await service.execute(mockDispatch);
      expect(publisherService.publishDeliveryAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: 'notif-1',
          outcome: 'sent',
        }),
        'sent',
      );
    });

    it('should persist delivery attempt to DB', async () => {
      await service.execute(mockDispatch);
      expect(deliveryAttemptsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationId: 'notif-1',
          status: 'SENT',
          providerId: 'prov-1',
        }),
      );
    });

    it('should observe delivery metrics', async () => {
      await service.execute(mockDispatch);
      expect(metricsService.incrementDelivery).toHaveBeenCalledWith(
        'email',
        'sendgrid',
        'sent',
      );
      expect(metricsService.observeDeliveryDuration).toHaveBeenCalled();
      expect(metricsService.observeAdapterCallDuration).toHaveBeenCalled();
    });

    it('should use default attemptNumber of 1', async () => {
      const result = await service.execute(mockDispatch);
      expect(result.attemptNumber).toBe(1);
    });

    it('should use provided attemptNumber', async () => {
      const result = await service.execute({
        ...mockDispatch,
        attemptNumber: 3,
      });
      expect(result.attemptNumber).toBe(3);
    });
  });

  describe('execute - validation', () => {
    it('should return failure when notificationId is missing', async () => {
      const result = await service.execute({
        ...mockDispatch,
        notificationId: '',
      });
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Missing required fields');
    });

    it('should return failure when channel is missing', async () => {
      const result = await service.execute({
        ...mockDispatch,
        channel: '',
      });
      expect(result.success).toBe(false);
    });

    it('should return failure when content.body is missing', async () => {
      const result = await service.execute({
        ...mockDispatch,
        content: { body: '' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('execute - provider resolution', () => {
    it('should fail when no active providers exist', async () => {
      providerCacheService.getActiveProvidersByChannel.mockReturnValue([]);
      providerConfigsRepo.findActiveByChannel.mockResolvedValue([]);

      const result = await service.execute(mockDispatch);
      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('No active provider');
    });

    it('should fallback to DB when cache returns empty', async () => {
      providerCacheService.getActiveProvidersByChannel.mockReturnValue([]);
      providerConfigsRepo.findActiveByChannel.mockResolvedValue([
        mockProvider as any,
      ]);

      const result = await service.execute(mockDispatch);
      expect(result.success).toBe(true);
      expect(providerConfigsRepo.findActiveByChannel).toHaveBeenCalledWith(
        'email',
      );
    });

    it('should fallback to DB when cache is disabled', async () => {
      providerCacheService.isEnabled.mockReturnValue(false);
      providerConfigsRepo.findActiveByChannel.mockResolvedValue([
        mockProvider as any,
      ]);

      const result = await service.execute(mockDispatch);
      expect(result.success).toBe(true);
    });

    it('should use weighted routing when configured', async () => {
      channelsRepo.findByType.mockResolvedValue({
        id: 'ch-1',
        type: 'email',
        routingMode: 'weighted',
      } as any);

      const provider2 = {
        ...mockProvider,
        id: 'prov-2',
        providerName: 'mailgun',
        routingWeight: 50,
      };
      providerCacheService.getActiveProvidersByChannel.mockReturnValue([
        mockProvider as any,
        provider2 as any,
      ]);

      const result = await service.execute(mockDispatch);
      expect(result.success).toBe(true);
    });

    it('should use failover routing when configured', async () => {
      channelsRepo.findByType.mockResolvedValue({
        id: 'ch-1',
        type: 'email',
        routingMode: 'failover',
      } as any);

      const result = await service.execute(mockDispatch);
      expect(result.success).toBe(true);
    });

    it('should skip unavailable providers in failover mode', async () => {
      channelsRepo.findByType.mockResolvedValue({
        id: 'ch-1',
        type: 'email',
        routingMode: 'failover',
      } as any);

      const provider2 = {
        ...mockProvider,
        id: 'prov-2',
        providerName: 'mailgun',
      };
      providerCacheService.getActiveProvidersByChannel.mockReturnValue([
        mockProvider as any,
        provider2 as any,
      ]);

      circuitBreakerService.canExecute
        .mockReturnValueOnce(false) // first provider unavailable (failover resolution)
        .mockReturnValueOnce(true) // second provider available (failover resolution)
        .mockReturnValueOnce(true); // pipeline CB check

      const result = await service.execute(mockDispatch);
      expect(result.success).toBe(true);
      expect(result.providerName).toBe('mailgun');
    });
  });

  describe('execute - circuit breaker open', () => {
    it('should retry or fallback when CB is open', async () => {
      circuitBreakerService.canExecute.mockReturnValue(false);

      const result = await service.execute(mockDispatch);
      expect(result.success).toBe(false);
      expect(metricsService.incrementAdapterUnavailable).toHaveBeenCalledWith(
        'sendgrid',
      );
    });
  });

  describe('execute - rate limit', () => {
    it('should retry when rate limit not acquired', async () => {
      rateLimiterService.acquire.mockResolvedValue({
        acquired: false,
        waitMs: 6000,
      });

      const result = await service.execute(mockDispatch);
      expect(result.success).toBe(false);
    });

    it('should observe rate limit wait when wait > 0', async () => {
      rateLimiterService.acquire.mockResolvedValue({
        acquired: true,
        waitMs: 100,
      });

      await service.execute(mockDispatch);
      expect(metricsService.observeRateLimitWait).toHaveBeenCalledWith(
        'sendgrid',
        100,
      );
    });

    it('should not observe rate limit wait when wait is 0', async () => {
      rateLimiterService.acquire.mockResolvedValue({
        acquired: true,
        waitMs: 0,
      });

      await service.execute(mockDispatch);
      expect(metricsService.observeRateLimitWait).not.toHaveBeenCalled();
    });
  });

  describe('execute - media processing', () => {
    it('should process media when present', async () => {
      const dispatchWithMedia = {
        ...mockDispatch,
        media: [
          {
            type: 'image',
            url: 'https://example.com/img.png',
            context: 'inline' as const,
          },
        ],
      };

      await service.execute(dispatchWithMedia);
      expect(mediaProcessorService.processMedia).toHaveBeenCalledWith(
        'email',
        dispatchWithMedia.media,
      );
    });

    it('should proceed without media on processing error (graceful degradation)', async () => {
      const dispatchWithMedia = {
        ...mockDispatch,
        media: [
          {
            type: 'image',
            url: 'https://example.com/img.png',
            context: 'inline' as const,
          },
        ],
      };
      mediaProcessorService.processMedia.mockRejectedValue(
        new Error('Download failed'),
      );

      const result = await service.execute(dispatchWithMedia);
      expect(result.success).toBe(true);
    });

    it('should not call processMedia when no media', async () => {
      await service.execute(mockDispatch);
      expect(mediaProcessorService.processMedia).not.toHaveBeenCalled();
    });
  });

  describe('execute - retryable failure', () => {
    beforeEach(() => {
      adapterClientService.send.mockResolvedValue({
        success: false,
        providerMessageId: null,
        retryable: true,
        errorMessage: 'Timeout',
        httpStatus: 504,
        providerResponse: null,
      });
    });

    it('should schedule retry when retryable and within limits', async () => {
      retryService.shouldRetry.mockReturnValue({
        shouldRetry: true,
        delay: 5000,
        reason: 'Retrying',
      });

      const result = await service.execute(mockDispatch);
      expect(result.success).toBe(false);
      expect(result.retryScheduled).toBe(true);
      expect(circuitBreakerService.recordFailure).toHaveBeenCalledWith(
        'prov-1',
      );
      expect(metricsService.incrementRetry).toHaveBeenCalled();
    });

    it('should publish retrying delivery attempt', async () => {
      retryService.shouldRetry.mockReturnValue({
        shouldRetry: true,
        delay: 5000,
        reason: 'Retrying',
      });

      await service.execute(mockDispatch);
      expect(publisherService.publishDeliveryAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'retrying' }),
        'retrying',
      );
    });

    it('should trigger fallback when retries exhausted', async () => {
      retryService.shouldRetry.mockReturnValue({
        shouldRetry: false,
        reason: 'Max retries exhausted',
      });

      await service.execute(mockDispatch);
      expect(fallbackService.triggerFallback).toHaveBeenCalled();
    });

    it('should publish to DLQ when no fallback available', async () => {
      retryService.shouldRetry.mockReturnValue({
        shouldRetry: false,
        reason: 'Max retries exhausted',
      });
      fallbackService.triggerFallback.mockResolvedValue(false);

      await service.execute(mockDispatch);
      expect(publisherService.publishToDlq).toHaveBeenCalled();
      expect(metricsService.incrementDlq).toHaveBeenCalledWith(
        'email',
        'sendgrid',
      );
    });

    it('should not publish to DLQ when fallback is triggered', async () => {
      retryService.shouldRetry.mockReturnValue({
        shouldRetry: false,
        reason: 'Max retries exhausted',
      });
      fallbackService.triggerFallback.mockResolvedValue(true);

      const result = await service.execute(mockDispatch);
      expect(result.fallbackTriggered).toBe(true);
      expect(publisherService.publishToDlq).not.toHaveBeenCalled();
    });
  });

  describe('execute - non-retryable failure', () => {
    it('should not record CB failure for non-retryable error', async () => {
      adapterClientService.send.mockResolvedValue({
        success: false,
        providerMessageId: null,
        retryable: false,
        errorMessage: 'Invalid recipient',
        httpStatus: 400,
        providerResponse: null,
      });

      const result = await service.execute(mockDispatch);
      expect(result.success).toBe(false);
      expect(circuitBreakerService.recordFailure).not.toHaveBeenCalled();
    });

    it('should publish FAILED status for non-retryable error', async () => {
      adapterClientService.send.mockResolvedValue({
        success: false,
        providerMessageId: null,
        retryable: false,
        errorMessage: 'Invalid recipient',
        httpStatus: 400,
        providerResponse: null,
      });

      await service.execute(mockDispatch);
      expect(publisherService.publishDeliveryStatus).toHaveBeenCalledWith(
        expect.objectContaining({ toStatus: 'FAILED' }),
      );
    });

    it('should publish failed delivery attempt', async () => {
      adapterClientService.send.mockResolvedValue({
        success: false,
        providerMessageId: null,
        retryable: false,
        errorMessage: 'Invalid',
        httpStatus: 400,
        providerResponse: null,
      });

      await service.execute(mockDispatch);
      expect(publisherService.publishDeliveryAttempt).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failed' }),
        'failed',
      );
    });

    it('should increment delivery failed metric', async () => {
      adapterClientService.send.mockResolvedValue({
        success: false,
        providerMessageId: null,
        retryable: false,
        errorMessage: 'Bad request',
        httpStatus: 400,
        providerResponse: null,
      });

      await service.execute(mockDispatch);
      expect(metricsService.incrementDelivery).toHaveBeenCalledWith(
        'email',
        'sendgrid',
        'failed',
      );
    });
  });

  describe('execute - adapter call metrics', () => {
    it('should observe adapter call duration', async () => {
      await service.execute(mockDispatch);
      expect(metricsService.observeAdapterCallDuration).toHaveBeenCalledWith(
        'sendgrid',
        expect.any(Number),
      );
    });
  });

  describe('execute - send request mapping', () => {
    it('should map dispatch to SendRequest correctly', async () => {
      await service.execute(mockDispatch);

      expect(adapterClientService.send).toHaveBeenCalledWith(
        'http://localhost:3170',
        expect.objectContaining({
          notificationId: 'notif-1',
          channel: 'email',
          priority: 'critical',
          recipient: { email: 'test@example.com', name: 'Test User' },
          content: { subject: 'Hello', body: '<p>Body</p>' },
          metadata: expect.objectContaining({
            correlationId: 'corr-1',
            eventType: 'order.created',
          }),
        }),
      );
    });

    it('should omit media from send request when empty', async () => {
      await service.execute(mockDispatch);

      const sendCall = adapterClientService.send.mock.calls[0];
      expect(sendCall[1].media).toBeUndefined();
    });

    it('should include processed media in send request', async () => {
      const processedMedia = [
        {
          type: 'image',
          filename: 'img.png',
          mimeType: 'image/png',
          content: 'base64data',
          context: 'attachment',
        },
      ];
      mediaProcessorService.processMedia.mockResolvedValue(
        processedMedia as any,
      );

      await service.execute({
        ...mockDispatch,
        media: [
          {
            type: 'image',
            url: 'https://example.com/img.png',
            context: 'attachment',
          },
        ],
      });

      const sendCall = adapterClientService.send.mock.calls[0];
      expect(sendCall[1].media).toBeDefined();
      expect(sendCall[1].media).toHaveLength(1);
    });
  });
});
