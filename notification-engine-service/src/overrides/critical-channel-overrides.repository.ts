import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { CriticalChannelOverride } from './entities/critical-channel-override.entity.js';

@Injectable()
export class CriticalChannelOverridesRepository extends PgBaseRepository<CriticalChannelOverride> {
  constructor(
    @InjectRepository(CriticalChannelOverride)
    repository: Repository<CriticalChannelOverride>,
  ) {
    super(repository);
  }

  async findActiveByEventType(
    eventType: string,
  ): Promise<CriticalChannelOverride[]> {
    return this.repository.find({
      where: { eventType, isActive: true },
    });
  }

  async findAllActive(): Promise<CriticalChannelOverride[]> {
    return this.repository.find({
      where: { isActive: true },
    });
  }

  async existsActiveOverride(
    eventType: string,
    channel: string,
    excludeId?: string,
  ): Promise<boolean> {
    const qb = this.repository
      .createQueryBuilder('override')
      .where('override.event_type = :eventType', { eventType })
      .andWhere('override.channel = :channel', { channel })
      .andWhere('override.is_active = true');

    if (excludeId) {
      qb.andWhere('override.id != :excludeId', { excludeId });
    }

    return (await qb.getCount()) > 0;
  }

  async create(
    data: Partial<CriticalChannelOverride>,
  ): Promise<CriticalChannelOverride> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async save(
    entity: CriticalChannelOverride,
  ): Promise<CriticalChannelOverride> {
    return this.repository.save(entity);
  }
}
