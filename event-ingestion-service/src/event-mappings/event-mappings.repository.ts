import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { EventMapping } from './entities/event-mapping.entity.js';

@Injectable()
export class EventMappingsRepository extends PgBaseRepository<EventMapping> {
  constructor(
    @InjectRepository(EventMapping)
    repository: Repository<EventMapping>,
  ) {
    super(repository);
  }

  async findBySourceAndType(
    sourceId: string,
    eventType: string,
  ): Promise<EventMapping | null> {
    return this.repository.findOne({
      where: { sourceId, eventType, isActive: true },
    });
  }

  async existsActiveMapping(
    sourceId: string,
    eventType: string,
    excludeId?: string,
  ): Promise<boolean> {
    const qb = this.repository
      .createQueryBuilder('mapping')
      .where('mapping.source_id = :sourceId', { sourceId })
      .andWhere('mapping.event_type = :eventType', { eventType })
      .andWhere('mapping.is_active = true');

    if (excludeId) {
      qb.andWhere('mapping.id != :excludeId', { excludeId });
    }

    const count = await qb.getCount();
    return count > 0;
  }

  async save(entity: EventMapping): Promise<EventMapping> {
    return this.repository.save(entity);
  }

  async create(data: Partial<EventMapping>): Promise<EventMapping> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async findAllActive(): Promise<EventMapping[]> {
    return this.repository.find({ where: { isActive: true } });
  }
}
