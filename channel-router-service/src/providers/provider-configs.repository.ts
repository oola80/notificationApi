import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { ProviderConfig } from './entities/provider-config.entity.js';

@Injectable()
export class ProviderConfigsRepository extends PgBaseRepository<ProviderConfig> {
  constructor(
    @InjectRepository(ProviderConfig)
    repository: Repository<ProviderConfig>,
  ) {
    super(repository);
  }

  async findAllProviders(): Promise<ProviderConfig[]> {
    return this.repository.find({ order: { providerName: 'ASC' } });
  }

  async findActiveByChannel(channel: string): Promise<ProviderConfig[]> {
    return this.repository.find({
      where: { channel, isActive: true },
      order: { routingWeight: 'DESC' },
    });
  }

  async findByAdapterUrl(adapterUrl: string): Promise<ProviderConfig | null> {
    return this.repository.findOne({ where: { adapterUrl } });
  }

  async save(entity: ProviderConfig): Promise<ProviderConfig> {
    return this.repository.save(entity);
  }

  async create(data: Partial<ProviderConfig>): Promise<ProviderConfig> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async remove(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
