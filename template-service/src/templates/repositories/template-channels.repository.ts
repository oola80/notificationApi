import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplateChannel } from '../entities/template-channel.entity.js';

@Injectable()
export class TemplateChannelsRepository {
  constructor(
    @InjectRepository(TemplateChannel)
    private readonly repository: Repository<TemplateChannel>,
  ) {}

  async createBatch(
    channels: Partial<TemplateChannel>[],
  ): Promise<TemplateChannel[]> {
    const entities = this.repository.create(channels);
    return this.repository.save(entities);
  }

  async findByVersionId(versionId: string): Promise<TemplateChannel[]> {
    return this.repository.find({
      where: { templateVersionId: versionId },
      order: { channel: 'ASC' },
    });
  }
}
