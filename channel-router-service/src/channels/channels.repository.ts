import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { Channel } from './entities/channel.entity.js';

@Injectable()
export class ChannelsRepository extends PgBaseRepository<Channel> {
  constructor(
    @InjectRepository(Channel)
    repository: Repository<Channel>,
  ) {
    super(repository);
  }

  async findAll(): Promise<Channel[]> {
    return this.repository.find({ order: { name: 'ASC' } });
  }

  async findByType(type: string): Promise<Channel | null> {
    return this.repository.findOne({ where: { type } });
  }

  async findAllActive(): Promise<Channel[]> {
    return this.repository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async save(entity: Channel): Promise<Channel> {
    return this.repository.save(entity);
  }

  async create(data: Partial<Channel>): Promise<Channel> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }
}
