import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TemplateVersion } from '../entities/template-version.entity.js';

@Injectable()
export class TemplateVersionsRepository {
  constructor(
    @InjectRepository(TemplateVersion)
    private readonly repository: Repository<TemplateVersion>,
  ) {}

  async getNextVersionNumber(templateId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder('v')
      .where('v.template_id = :templateId', { templateId })
      .select('COALESCE(MAX(v.version_number), 0)', 'maxVersion')
      .getRawOne();
    return (result?.maxVersion ?? 0) + 1;
  }

  async findByTemplateId(templateId: string): Promise<TemplateVersion[]> {
    return this.repository.find({
      where: { templateId },
      relations: ['channels'],
      order: { versionNumber: 'DESC' },
    });
  }

  async create(data: Partial<TemplateVersion>): Promise<TemplateVersion> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }
}
