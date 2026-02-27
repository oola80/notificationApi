import { Injectable, Logger } from '@nestjs/common';
import { ProviderConfigsRepository } from './provider-configs.repository.js';
import { ProviderCacheService } from './provider-cache.service.js';
import { AdapterClientService } from '../adapter-client/adapter-client.service.js';
import { ProviderConfig } from './entities/provider-config.entity.js';
import { RegisterProviderDto } from './dto/register-provider.dto.js';
import { UpdateProviderConfigDto } from './dto/update-provider-config.dto.js';
import { createErrorResponse } from '../common/errors.js';
import {
  AdapterCapabilitiesResponse,
  AdapterHealthResponse,
} from '../adapter-client/interfaces/adapter-client.interfaces.js';

@Injectable()
export class ProvidersService {
  private readonly logger = new Logger(ProvidersService.name);

  constructor(
    private readonly providerConfigsRepository: ProviderConfigsRepository,
    private readonly providerCacheService: ProviderCacheService,
    private readonly adapterClientService: AdapterClientService,
  ) {}

  async register(dto: RegisterProviderDto): Promise<ProviderConfig> {
    const existing = await this.providerConfigsRepository.findByAdapterUrl(
      dto.adapterUrl,
    );
    if (existing) {
      throw createErrorResponse('CRS-020');
    }

    let capabilities: AdapterCapabilitiesResponse | null = null;
    try {
      capabilities = await this.adapterClientService.getCapabilities(
        dto.adapterUrl,
      );
    } catch (error: any) {
      this.logger.warn(
        `Could not fetch capabilities from ${dto.adapterUrl}: ${error.message}`,
      );
    }

    try {
      await this.adapterClientService.checkHealth(dto.adapterUrl);
    } catch (error: any) {
      this.logger.warn(
        `Health check failed for ${dto.adapterUrl}: ${error.message}`,
      );
    }

    const provider = await this.providerConfigsRepository.create({
      providerName: dto.providerName,
      providerId: dto.providerId,
      channel: dto.channel,
      adapterUrl: dto.adapterUrl,
      isActive: dto.isActive ?? true,
      routingWeight: dto.routingWeight ?? 100,
      rateLimitTokensPerSec: dto.rateLimitTokensPerSec ?? null,
      rateLimitMaxBurst: dto.rateLimitMaxBurst ?? null,
      configJson: capabilities
        ? {
            supportedChannels: capabilities.supportedChannels,
            supportsAttachments: capabilities.supportsAttachments,
            supportsMediaUrls: capabilities.supportsMediaUrls,
            maxAttachmentSizeMb: capabilities.maxAttachmentSizeMb,
            maxRecipientsPerRequest: capabilities.maxRecipientsPerRequest,
            webhookPath: capabilities.webhookPath,
          }
        : null,
    });

    await this.providerCacheService.invalidate();
    this.logger.log(
      `Provider registered: ${provider.id} (${dto.providerName}/${dto.providerId} on ${dto.channel})`,
    );
    return provider;
  }

  async deregister(id: string): Promise<void> {
    const provider = await this.providerConfigsRepository.findById(id);
    if (!provider) {
      throw createErrorResponse('CRS-009');
    }

    await this.providerConfigsRepository.remove(id);
    await this.providerCacheService.invalidate();
    this.logger.log(
      `Provider deregistered: ${id} (${provider.providerName}/${provider.providerId})`,
    );
  }

  async findAll(): Promise<ProviderConfig[]> {
    return this.providerConfigsRepository.findAllProviders();
  }

  async findById(id: string): Promise<ProviderConfig> {
    const provider = await this.providerConfigsRepository.findById(id);
    if (!provider) {
      throw createErrorResponse('CRS-009');
    }
    return provider;
  }

  async updateConfig(
    id: string,
    dto: UpdateProviderConfigDto,
  ): Promise<ProviderConfig> {
    const provider = await this.providerConfigsRepository.findById(id);
    if (!provider) {
      throw createErrorResponse('CRS-009');
    }

    if (dto.adapterUrl !== undefined) {
      const existing = await this.providerConfigsRepository.findByAdapterUrl(
        dto.adapterUrl,
      );
      if (existing && existing.id !== id) {
        throw createErrorResponse('CRS-020');
      }
      provider.adapterUrl = dto.adapterUrl;
    }

    if (dto.routingWeight !== undefined)
      provider.routingWeight = dto.routingWeight;
    if (dto.rateLimitTokensPerSec !== undefined)
      provider.rateLimitTokensPerSec = dto.rateLimitTokensPerSec;
    if (dto.rateLimitMaxBurst !== undefined)
      provider.rateLimitMaxBurst = dto.rateLimitMaxBurst;
    if (dto.isActive !== undefined) provider.isActive = dto.isActive;

    const updated = await this.providerConfigsRepository.save(provider);
    await this.providerCacheService.invalidate();
    this.logger.log(`Provider config updated: ${id}`);
    return updated;
  }

  async getCapabilities(id: string): Promise<AdapterCapabilitiesResponse> {
    const provider = await this.findById(id);
    try {
      return await this.adapterClientService.getCapabilities(
        provider.adapterUrl,
      );
    } catch (error: any) {
      throw createErrorResponse(
        'CRS-002',
        `Could not reach adapter at ${provider.adapterUrl}: ${error.message}`,
      );
    }
  }

  async getHealth(id: string): Promise<AdapterHealthResponse> {
    const provider = await this.findById(id);
    try {
      const health = await this.adapterClientService.checkHealth(
        provider.adapterUrl,
      );
      provider.lastHealthCheck = new Date();
      await this.providerConfigsRepository.save(provider);
      return health;
    } catch (error: any) {
      throw createErrorResponse(
        'CRS-013',
        `Health check failed for adapter at ${provider.adapterUrl}: ${error.message}`,
      );
    }
  }

  async findActiveByChannel(channel: string): Promise<ProviderConfig[]> {
    if (this.providerCacheService.isEnabled()) {
      const cached =
        this.providerCacheService.getActiveProvidersByChannel(channel);
      if (cached.length > 0) {
        return cached;
      }
    }
    return this.providerConfigsRepository.findActiveByChannel(channel);
  }
}
