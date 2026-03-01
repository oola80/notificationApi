import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ChannelsRepository } from './channels.repository.js';
import { ProviderConfigsRepository } from '../providers/provider-configs.repository.js';
import { Channel } from './entities/channel.entity.js';
import { UpdateChannelConfigDto } from './dto/update-channel-config.dto.js';
import { createErrorResponse } from '../common/errors.js';

const DEFAULT_CHANNELS = [
  { name: 'Email', type: 'email' },
  { name: 'SMS', type: 'sms' },
  { name: 'WhatsApp', type: 'whatsapp' },
  { name: 'Push', type: 'push' },
];

@Injectable()
export class ChannelsService implements OnModuleInit {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private readonly channelsRepository: ChannelsRepository,
    private readonly providerConfigsRepository: ProviderConfigsRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaultChannels();
  }

  async findAll(): Promise<Record<string, any>[]> {
    const channels = await this.channelsRepository.findAll();
    const result: Record<string, any>[] = [];

    for (const channel of channels) {
      result.push(await this.enrichChannel(channel));
    }

    return result;
  }

  async findById(id: string): Promise<Record<string, any>> {
    const channel = await this.channelsRepository.findById(id);
    if (!channel) {
      throw createErrorResponse('CRS-008');
    }
    return this.enrichChannel(channel);
  }

  private async enrichChannel(channel: Channel): Promise<Record<string, any>> {
    const providers =
      await this.providerConfigsRepository.findActiveByChannel(channel.type);

    return {
      id: channel.id,
      name: channel.name,
      type: channel.type,
      isActive: channel.isActive,
      routingMode: channel.routingMode,
      fallbackChannelId: channel.fallbackChannelId,
      providers: providers.map((p) => ({
        id: p.id,
        providerName: p.providerName,
        providerId: p.providerId,
        adapterUrl: p.adapterUrl,
        isActive: p.isActive,
        routingWeight: p.routingWeight,
        circuitBreakerState: p.circuitBreakerState,
      })),
      createdAt: channel.createdAt,
      updatedAt: channel.updatedAt,
    };
  }

  async updateConfig(
    id: string,
    dto: UpdateChannelConfigDto,
  ): Promise<Channel> {
    const channel = await this.channelsRepository.findById(id);
    if (!channel) {
      throw createErrorResponse('CRS-008');
    }

    if (dto.activeProviderId !== undefined) {
      const provider = await this.providerConfigsRepository.findById(
        dto.activeProviderId,
      );
      if (!provider) {
        throw createErrorResponse('CRS-009');
      }
      if (!provider.isActive) {
        throw createErrorResponse('CRS-010');
      }
      if (provider.channel !== channel.type) {
        throw createErrorResponse(
          'CRS-001',
          `Provider channel '${provider.channel}' does not match channel type '${channel.type}'`,
        );
      }
    }

    if (dto.fallbackChannelId !== undefined) {
      if (dto.fallbackChannelId !== null) {
        if (dto.fallbackChannelId === id) {
          throw createErrorResponse(
            'CRS-001',
            'A channel cannot be its own fallback',
          );
        }
        const fallbackChannel = await this.channelsRepository.findById(
          dto.fallbackChannelId,
        );
        if (!fallbackChannel) {
          throw createErrorResponse('CRS-008', 'Fallback channel not found');
        }
      }
      channel.fallbackChannelId = dto.fallbackChannelId;
    }

    if (dto.routingMode !== undefined) channel.routingMode = dto.routingMode;
    if (dto.isActive !== undefined) channel.isActive = dto.isActive;

    const updated = await this.channelsRepository.save(channel);
    this.logger.log(`Channel config updated: ${id} (${channel.type})`);
    return updated;
  }

  private async seedDefaultChannels(): Promise<void> {
    const existing = await this.channelsRepository.findAll();
    if (existing.length > 0) {
      this.logger.log(
        `Channels table has ${existing.length} rows, skipping seed`,
      );
      return;
    }

    for (const ch of DEFAULT_CHANNELS) {
      await this.channelsRepository.create({
        name: ch.name,
        type: ch.type,
        isActive: true,
        routingMode: 'primary',
      });
    }

    this.logger.log('Seeded 4 default channels (email, sms, whatsapp, push)');
  }
}
