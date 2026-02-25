import { Injectable, Logger } from '@nestjs/common';
import { CustomerPreferencesRepository } from './customer-preferences.repository.js';
import { PreferenceCacheService } from './preference-cache.service.js';
import { UpsertPreferenceDto, BulkUpsertPreferencesDto } from './dto/index.js';
import { createErrorResponse } from '../common/errors.js';
import { CustomerChannelPreference } from './entities/customer-channel-preference.entity.js';

@Injectable()
export class CustomerPreferencesService {
  private readonly logger = new Logger(CustomerPreferencesService.name);

  constructor(
    private readonly repository: CustomerPreferencesRepository,
    private readonly cache: PreferenceCacheService,
  ) {}

  async upsert(dto: UpsertPreferenceDto): Promise<CustomerChannelPreference> {
    const preference = await this.repository.upsertPreference(
      dto.customerId,
      dto.channel,
      dto.isOptedIn,
      dto.sourceSystem,
    );
    this.cache.evict(dto.customerId);
    this.logger.log(
      `Preference upserted: ${dto.customerId}/${dto.channel} → ${dto.isOptedIn}`,
    );
    return preference;
  }

  async bulkUpsert(
    dto: BulkUpsertPreferencesDto,
  ): Promise<{ processed: number }> {
    if (dto.preferences.length > 1000) {
      throw createErrorResponse('NES-012');
    }

    await this.repository.bulkUpsert(
      dto.preferences.map((p) => ({
        customerId: p.customerId,
        channel: p.channel,
        isOptedIn: p.isOptedIn,
        sourceSystem: p.sourceSystem,
      })),
    );

    const affectedCustomerIds = [
      ...new Set(dto.preferences.map((p) => p.customerId)),
    ];
    for (const customerId of affectedCustomerIds) {
      this.cache.evict(customerId);
    }

    this.logger.log(
      `Bulk preference upsert: ${dto.preferences.length} records processed`,
    );
    return { processed: dto.preferences.length };
  }

  async getPreferences(
    customerId: string,
  ): Promise<CustomerChannelPreference[]> {
    return this.cache.getPreferences(customerId);
  }
}
