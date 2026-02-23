import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { EventSource } from './entities/event-source.entity.js';

@Injectable()
export class EventSourcesRepository extends PgBaseRepository<EventSource> {
  constructor(
    @InjectRepository(EventSource)
    repository: Repository<EventSource>,
  ) {
    super(repository);
  }

  async findByName(name: string): Promise<EventSource | null> {
    return this.repository.findOne({ where: { name } });
  }
}
