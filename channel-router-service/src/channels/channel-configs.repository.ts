import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { ChannelConfig } from './entities/channel-config.entity.js';

@Injectable()
export class ChannelConfigsRepository extends PgBaseRepository<ChannelConfig> {
  constructor(
    @InjectRepository(ChannelConfig)
    repository: Repository<ChannelConfig>,
  ) {
    super(repository);
  }

  async findByChannelId(channelId: string): Promise<ChannelConfig[]> {
    return this.repository.find({
      where: { channelId },
      order: { configKey: 'ASC' },
    });
  }

  async save(entity: ChannelConfig): Promise<ChannelConfig> {
    return this.repository.save(entity);
  }

  async create(data: Partial<ChannelConfig>): Promise<ChannelConfig> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }
}
