import { Injectable, Logger } from '@nestjs/common';
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
import { PipelineResult } from './interfaces/pipeline-result.interface.js';
import { SendRequest } from '../adapter-client/interfaces/adapter-client.interfaces.js';
import { ProviderConfig } from '../providers/entities/provider-config.entity.js';
import {
  EXCHANGE_NOTIFICATIONS_DELIVER,
  deliverRoutingKey,
} from '../rabbitmq/rabbitmq.constants.js';

@Injectable()
export class DeliveryPipelineService {
  private readonly logger = new Logger(DeliveryPipelineService.name);

  constructor(
    private readonly providerCacheService: ProviderCacheService,
    private readonly providerConfigsRepository: ProviderConfigsRepository,
    private readonly channelsRepository: ChannelsRepository,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly retryService: RetryService,
    private readonly mediaProcessorService: MediaProcessorService,
    private readonly adapterClientService: AdapterClientService,
    private readonly publisherService: RabbitMQPublisherService,
    private readonly fallbackService: FallbackService,
    private readonly metricsService: MetricsService,
    private readonly deliveryAttemptsRepository: DeliveryAttemptsRepository,
  ) {}

  async execute(dispatch: DispatchMessage): Promise<PipelineResult> {
    const pipelineStart = Date.now();
    const attemptNumber = dispatch.attemptNumber ?? 1;

    this.logger.log(
      `Pipeline started: ${dispatch.notificationId} channel=${dispatch.channel} attempt=${attemptNumber}`,
    );

    // Step 1: Parse & validate
    if (
      !dispatch.notificationId ||
      !dispatch.channel ||
      !dispatch.content?.body
    ) {
      this.logger.warn(
        `Invalid dispatch message: missing required fields for ${dispatch.notificationId}`,
      );
      return {
        success: false,
        notificationId: dispatch.notificationId ?? 'unknown',
        channel: dispatch.channel ?? 'unknown',
        attemptNumber,
        durationMs: Date.now() - pipelineStart,
        errorMessage:
          'Missing required fields: notificationId, channel, or content.body',
      };
    }

    // Step 2: Resolve adapter
    const provider = await this.resolveProvider(dispatch.channel);
    if (!provider) {
      this.publishDeliveryStatus(dispatch, 'DELIVERING', 'FAILED', undefined, {
        reason: 'No active provider available',
      });
      return {
        success: false,
        notificationId: dispatch.notificationId,
        channel: dispatch.channel,
        attemptNumber,
        durationMs: Date.now() - pipelineStart,
        errorMessage: 'No active provider available for channel',
      };
    }

    // Step 3: Check circuit breaker
    if (!this.circuitBreakerService.canExecute(provider.id)) {
      this.metricsService.incrementAdapterUnavailable(provider.providerName);
      return this.handleRetryOrFallback(
        dispatch,
        provider,
        attemptNumber,
        pipelineStart,
        'Circuit breaker is open',
      );
    }

    // Step 4: Rate limit
    const rateLimitResult = await this.rateLimiterService.acquire(
      provider.id,
      5000,
    );
    if (!rateLimitResult.acquired) {
      return this.handleRetryOrFallback(
        dispatch,
        provider,
        attemptNumber,
        pipelineStart,
        'Rate limit exceeded',
      );
    }
    if (rateLimitResult.waitMs > 0) {
      this.metricsService.observeRateLimitWait(
        provider.providerName,
        rateLimitResult.waitMs,
      );
    }

    // Step 5: Process media (graceful degradation)
    let processedMedia: Array<{
      type: string;
      filename?: string;
      mimeType?: string;
      content?: string;
      url?: string;
      context: string;
    }> = [];
    if (dispatch.media && dispatch.media.length > 0) {
      try {
        processedMedia = await this.mediaProcessorService.processMedia(
          dispatch.channel,
          dispatch.media,
        );
      } catch (error) {
        this.logger.warn(
          `Media processing failed for ${dispatch.notificationId}, proceeding without media: ${(error as Error).message}`,
        );
      }
    }

    // Step 6: Send to adapter
    const sendRequest: SendRequest = {
      notificationId: dispatch.notificationId,
      channel: dispatch.channel,
      priority: dispatch.priority,
      recipient: dispatch.recipient,
      content: dispatch.content,
      media:
        processedMedia.length > 0
          ? processedMedia.map((m) => ({
              type: m.type,
              filename: m.filename,
              mimeType: m.mimeType ?? '',
              content: m.content,
              url: m.url,
              context: m.context,
            }))
          : undefined,
      metadata: {
        correlationId: dispatch.metadata?.correlationId,
        sourceId: dispatch.metadata?.sourceId,
        eventType: dispatch.metadata?.eventType,
        cycleId: dispatch.metadata?.cycleId,
        dispatchedAt: dispatch.metadata?.dispatchedAt,
      },
    };

    const sendStart = Date.now();
    const sendResult = await this.adapterClientService.send(
      provider.adapterUrl,
      sendRequest,
    );
    const sendDurationMs = Date.now() - sendStart;

    this.metricsService.observeAdapterCallDuration(
      provider.providerName,
      sendDurationMs,
    );

    // Step 7: Handle result
    const totalDurationMs = Date.now() - pipelineStart;

    if (sendResult.success) {
      this.circuitBreakerService.recordSuccess(provider.id);

      this.publishDeliveryStatus(dispatch, 'DELIVERING', 'SENT', provider, {
        providerMessageId: sendResult.providerMessageId,
      });

      this.publishDeliveryAttempt(
        dispatch,
        provider,
        attemptNumber,
        'sent',
        sendDurationMs,
        sendResult.providerMessageId,
      );

      this.persistDeliveryAttempt(
        dispatch,
        provider,
        attemptNumber,
        'SENT',
        sendDurationMs,
        sendResult,
      );

      this.metricsService.incrementDelivery(
        dispatch.channel,
        provider.providerName,
        'sent',
      );
      this.metricsService.observeDeliveryDuration(
        dispatch.channel,
        provider.providerName,
        totalDurationMs,
      );

      this.logger.log(
        `Pipeline success: ${dispatch.notificationId} provider=${provider.providerName} duration=${totalDurationMs}ms`,
      );

      return {
        success: true,
        notificationId: dispatch.notificationId,
        channel: dispatch.channel,
        providerId: provider.id,
        providerName: provider.providerName,
        providerMessageId: sendResult.providerMessageId ?? undefined,
        attemptNumber,
        durationMs: totalDurationMs,
      };
    }

    // Failure handling
    if (sendResult.retryable) {
      this.circuitBreakerService.recordFailure(provider.id);

      const retryResult = this.retryService.shouldRetry(
        dispatch.channel,
        attemptNumber,
        true,
      );

      if (retryResult.shouldRetry) {
        this.publishDeliveryAttempt(
          dispatch,
          provider,
          attemptNumber,
          'retrying',
          sendDurationMs,
          undefined,
          sendResult.errorMessage ?? undefined,
        );

        this.persistDeliveryAttempt(
          dispatch,
          provider,
          attemptNumber,
          'RETRYING',
          sendDurationMs,
          sendResult,
        );

        this.metricsService.incrementRetry(
          dispatch.channel,
          provider.providerName,
          String(attemptNumber),
        );

        const retryMessage = {
          ...dispatch,
          attemptNumber: attemptNumber + 1,
        };
        const retryRoutingKey = deliverRoutingKey(
          dispatch.priority,
          dispatch.channel,
        );

        setTimeout(() => {
          this.publisherService
            .republishForRetry(
              EXCHANGE_NOTIFICATIONS_DELIVER,
              retryRoutingKey,
              retryMessage as unknown as Record<string, any>,
              {
                'x-attempt': String(attemptNumber + 1),
                'x-retry-delay': String(retryResult.delay),
              },
            )
            .catch((err) => {
              this.logger.error(
                `Failed to republish for retry: ${dispatch.notificationId}`,
                (err as Error).stack,
              );
            });
        }, retryResult.delay);

        this.metricsService.observeDeliveryDuration(
          dispatch.channel,
          provider.providerName,
          totalDurationMs,
        );

        this.logger.log(
          `Retry scheduled: ${dispatch.notificationId} attempt=${attemptNumber + 1} delay=${retryResult.delay}ms`,
        );

        return {
          success: false,
          notificationId: dispatch.notificationId,
          channel: dispatch.channel,
          providerId: provider.id,
          providerName: provider.providerName,
          attemptNumber,
          durationMs: totalDurationMs,
          errorMessage: sendResult.errorMessage ?? undefined,
          retryScheduled: true,
        };
      }

      // Max retries exhausted
      return this.handleTerminalFailure(
        dispatch,
        provider,
        sendResult,
        attemptNumber,
        sendDurationMs,
        pipelineStart,
      );
    }

    // Non-retryable failure — do NOT record CB failure
    this.publishDeliveryStatus(dispatch, 'DELIVERING', 'FAILED', provider, {
      errorMessage: sendResult.errorMessage,
      httpStatus: sendResult.httpStatus,
    });

    this.publishDeliveryAttempt(
      dispatch,
      provider,
      attemptNumber,
      'failed',
      sendDurationMs,
      undefined,
      sendResult.errorMessage ?? undefined,
    );

    this.persistDeliveryAttempt(
      dispatch,
      provider,
      attemptNumber,
      'FAILED',
      sendDurationMs,
      sendResult,
    );

    this.metricsService.incrementDelivery(
      dispatch.channel,
      provider.providerName,
      'failed',
    );
    this.metricsService.observeDeliveryDuration(
      dispatch.channel,
      provider.providerName,
      totalDurationMs,
    );

    this.logger.warn(
      `Pipeline failed (non-retryable): ${dispatch.notificationId} error=${sendResult.errorMessage}`,
    );

    return {
      success: false,
      notificationId: dispatch.notificationId,
      channel: dispatch.channel,
      providerId: provider.id,
      providerName: provider.providerName,
      attemptNumber,
      durationMs: totalDurationMs,
      errorMessage: sendResult.errorMessage ?? undefined,
    };
  }

  private async resolveProvider(
    channel: string,
  ): Promise<ProviderConfig | null> {
    let providers: ProviderConfig[];

    if (this.providerCacheService.isEnabled()) {
      providers =
        this.providerCacheService.getActiveProvidersByChannel(channel) ?? [];
    } else {
      providers = [];
    }

    if (providers.length === 0) {
      providers =
        await this.providerConfigsRepository.findActiveByChannel(channel);
    }

    if (providers.length === 0) {
      return null;
    }

    const channelEntity = await this.channelsRepository.findByType(channel);
    const routingMode = channelEntity?.routingMode ?? 'primary';

    switch (routingMode) {
      case 'weighted':
        return this.selectWeighted(providers);
      case 'failover':
        return this.selectFailover(providers);
      case 'primary':
      default:
        return providers[0];
    }
  }

  private selectWeighted(providers: ProviderConfig[]): ProviderConfig {
    const totalWeight = providers.reduce(
      (sum, p) => sum + (p.routingWeight ?? 100),
      0,
    );
    let random = Math.random() * totalWeight;
    for (const provider of providers) {
      random -= provider.routingWeight ?? 100;
      if (random <= 0) {
        return provider;
      }
    }
    return providers[providers.length - 1];
  }

  private selectFailover(providers: ProviderConfig[]): ProviderConfig | null {
    for (const provider of providers) {
      if (this.circuitBreakerService.canExecute(provider.id)) {
        return provider;
      }
    }
    return null;
  }

  private async handleRetryOrFallback(
    dispatch: DispatchMessage,
    provider: ProviderConfig,
    attemptNumber: number,
    pipelineStart: number,
    reason: string,
  ): Promise<PipelineResult> {
    const retryResult = this.retryService.shouldRetry(
      dispatch.channel,
      attemptNumber,
      true,
    );

    if (retryResult.shouldRetry) {
      this.metricsService.incrementRetry(
        dispatch.channel,
        provider.providerName,
        String(attemptNumber),
      );

      const retryMessage = {
        ...dispatch,
        attemptNumber: attemptNumber + 1,
      };
      const retryRoutingKey = deliverRoutingKey(
        dispatch.priority,
        dispatch.channel,
      );

      setTimeout(() => {
        this.publisherService
          .republishForRetry(
            EXCHANGE_NOTIFICATIONS_DELIVER,
            retryRoutingKey,
            retryMessage as unknown as Record<string, any>,
            {
              'x-attempt': String(attemptNumber + 1),
              'x-retry-delay': String(retryResult.delay),
            },
          )
          .catch((err) => {
            this.logger.error(
              `Failed to republish for retry: ${dispatch.notificationId}`,
              (err as Error).stack,
            );
          });
      }, retryResult.delay);

      return {
        success: false,
        notificationId: dispatch.notificationId,
        channel: dispatch.channel,
        providerId: provider.id,
        providerName: provider.providerName,
        attemptNumber,
        durationMs: Date.now() - pipelineStart,
        errorMessage: reason,
        retryScheduled: true,
      };
    }

    // Retries exhausted — try fallback
    return this.handleTerminalFailure(
      dispatch,
      provider,
      { errorMessage: reason },
      attemptNumber,
      0,
      pipelineStart,
    );
  }

  private async handleTerminalFailure(
    dispatch: DispatchMessage,
    provider: ProviderConfig,
    sendResult: { errorMessage?: string | null },
    attemptNumber: number,
    sendDurationMs: number,
    pipelineStart: number,
  ): Promise<PipelineResult> {
    const fallbackTriggered = await this.fallbackService.triggerFallback(
      dispatch,
      this.publisherService,
    );

    this.publishDeliveryStatus(dispatch, 'DELIVERING', 'FAILED', provider, {
      errorMessage: sendResult.errorMessage,
      fallbackTriggered,
    });

    this.publishDeliveryAttempt(
      dispatch,
      provider,
      attemptNumber,
      'failed',
      sendDurationMs,
      undefined,
      sendResult.errorMessage ?? undefined,
    );

    this.persistDeliveryAttempt(
      dispatch,
      provider,
      attemptNumber,
      'FAILED',
      sendDurationMs,
      sendResult as any,
    );

    if (!fallbackTriggered) {
      this.publisherService.publishToDlq(
        dispatch as unknown as Record<string, any>,
        {
          notificationId: dispatch.notificationId,
          channel: dispatch.channel,
          reason: sendResult.errorMessage ?? 'Max retries exhausted',
          attemptNumber,
        },
      );
      this.metricsService.incrementDlq(dispatch.channel, provider.providerName);
    }

    this.metricsService.incrementDelivery(
      dispatch.channel,
      provider.providerName,
      'failed',
    );

    const totalDurationMs = Date.now() - pipelineStart;
    this.metricsService.observeDeliveryDuration(
      dispatch.channel,
      provider.providerName,
      totalDurationMs,
    );

    this.logger.warn(
      `Pipeline terminal failure: ${dispatch.notificationId} fallback=${fallbackTriggered}`,
    );

    return {
      success: false,
      notificationId: dispatch.notificationId,
      channel: dispatch.channel,
      providerId: provider.id,
      providerName: provider.providerName,
      attemptNumber,
      durationMs: totalDurationMs,
      errorMessage: sendResult.errorMessage ?? undefined,
      fallbackTriggered,
    };
  }

  private publishDeliveryStatus(
    dispatch: DispatchMessage,
    fromStatus: string,
    toStatus: string,
    provider?: ProviderConfig,
    metadata?: Record<string, any>,
  ): void {
    this.publisherService.publishDeliveryStatus({
      notificationId: dispatch.notificationId,
      fromStatus,
      toStatus,
      channel: dispatch.channel,
      providerId: provider?.id,
      providerName: provider?.providerName,
      metadata: {
        ...metadata,
        correlationId: dispatch.metadata?.correlationId,
        cycleId: dispatch.metadata?.cycleId,
      },
      timestamp: new Date().toISOString(),
    });
  }

  private publishDeliveryAttempt(
    dispatch: DispatchMessage,
    provider: ProviderConfig,
    attemptNumber: number,
    outcome: string,
    durationMs: number,
    providerMessageId?: string | null,
    errorMessage?: string,
  ): void {
    this.publisherService.publishDeliveryAttempt(
      {
        notificationId: dispatch.notificationId,
        channel: dispatch.channel,
        providerId: provider.id,
        providerName: provider.providerName,
        attemptNumber,
        outcome,
        durationMs,
        providerMessageId: providerMessageId ?? undefined,
        errorMessage,
        metadata: {
          correlationId: dispatch.metadata?.correlationId,
          cycleId: dispatch.metadata?.cycleId,
        },
        timestamp: new Date().toISOString(),
      },
      outcome,
    );
  }

  private persistDeliveryAttempt(
    dispatch: DispatchMessage,
    provider: ProviderConfig,
    attemptNumber: number,
    status: string,
    durationMs: number,
    sendResult: any,
  ): void {
    this.deliveryAttemptsRepository
      .create({
        notificationId: dispatch.notificationId,
        correlationId: dispatch.metadata?.correlationId,
        channel: dispatch.channel,
        providerId: provider.id,
        attemptNumber,
        status,
        durationMs,
        providerMessageId: sendResult?.providerMessageId ?? null,
        providerResponse: sendResult?.providerResponse ?? null,
        errorMessage: sendResult?.errorMessage ?? null,
      })
      .catch((err) => {
        this.logger.error(
          `Failed to persist delivery attempt for ${dispatch.notificationId}`,
          (err as Error).stack,
        );
      });
  }
}
