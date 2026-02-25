import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerChannelPreference } from './entities/customer-channel-preference.entity.js';

@Injectable()
export class CustomerPreferencesRepository {
  constructor(
    @InjectRepository(CustomerChannelPreference)
    private readonly repository: Repository<CustomerChannelPreference>,
  ) {}

  async findByCustomerId(
    customerId: string,
  ): Promise<CustomerChannelPreference[]> {
    return this.repository.find({ where: { customerId } });
  }

  async upsertPreference(
    customerId: string,
    channel: string,
    isOptedIn: boolean,
    sourceSystem?: string,
  ): Promise<CustomerChannelPreference> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(CustomerChannelPreference)
      .values({
        customerId,
        channel,
        isOptedIn,
        sourceSystem: sourceSystem ?? null,
      })
      .orUpdate(
        ['is_opted_in', 'source_system', 'updated_at'],
        ['customer_id', 'channel'],
      )
      .execute();

    const result = await this.repository.findOne({
      where: { customerId, channel },
    });
    return result!;
  }

  async bulkUpsert(
    records: {
      customerId: string;
      channel: string;
      isOptedIn: boolean;
      sourceSystem?: string;
    }[],
  ): Promise<void> {
    const batchSize = 100;

    await this.repository.manager.transaction(async (manager) => {
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        await manager
          .createQueryBuilder()
          .insert()
          .into(CustomerChannelPreference)
          .values(
            batch.map((r) => ({
              customerId: r.customerId,
              channel: r.channel,
              isOptedIn: r.isOptedIn,
              sourceSystem: r.sourceSystem ?? null,
            })),
          )
          .orUpdate(
            ['is_opted_in', 'source_system', 'updated_at'],
            ['customer_id', 'channel'],
          )
          .execute();
      }
    });
  }
}
