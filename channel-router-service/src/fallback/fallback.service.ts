import { Injectable, Logger } from '@nestjs/common';
import { ChannelsRepository } from '../channels/channels.repository.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { DispatchMessage } from '../delivery/interfaces/dispatch-message.interface.js';
import { RabbitMQPublisherService } from '../rabbitmq/rabbitmq-publisher.service.js';

@Injectable()
export class FallbackService {
  private readonly logger = new Logger(FallbackService.name);

  constructor(
    private readonly channelsRepository: ChannelsRepository,
    private readonly metricsService: MetricsService,
  ) {}

  async triggerFallback(
    dispatch: DispatchMessage,
    publisherService: RabbitMQPublisherService,
  ): Promise<boolean> {
    if (dispatch.isFallback === true) {
      this.logger.debug(
        `Skipping fallback for ${dispatch.notificationId} — already a fallback message`,
      );
      return false;
    }

    const channel = await this.channelsRepository.findByType(dispatch.channel);
    if (!channel?.fallbackChannelId) {
      this.logger.debug(
        `No fallback configured for channel ${dispatch.channel}`,
      );
      return false;
    }

    const fallbackChannel = await this.channelsRepository.findById(
      channel.fallbackChannelId,
    );
    if (!fallbackChannel || !fallbackChannel.isActive) {
      this.logger.warn(
        `Fallback channel ${channel.fallbackChannelId} not found or inactive`,
      );
      return false;
    }

    const fallbackDispatch: DispatchMessage = {
      ...dispatch,
      channel: fallbackChannel.type,
      isFallback: true,
      attemptNumber: 1,
      metadata: {
        ...dispatch.metadata,
        fallbackChannel: dispatch.channel,
      },
    };

    publisherService.publishFallbackDispatch(
      fallbackDispatch as unknown as Record<string, any>,
    );

    this.metricsService.incrementFallbackTriggered(
      dispatch.channel,
      fallbackChannel.type,
    );

    this.logger.log(
      `Fallback triggered for ${dispatch.notificationId}: ${dispatch.channel} → ${fallbackChannel.type}`,
    );

    return true;
  }
}
