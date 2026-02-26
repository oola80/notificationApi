import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PgBaseRepository,
  PaginatedResult,
} from '../../common/base/pg-base.repository.js';
import { Template } from '../entities/template.entity.js';
import { ListTemplatesQueryDto } from '../dto/list-templates-query.dto.js';

@Injectable()
export class TemplatesRepository extends PgBaseRepository<Template> {
  constructor(
    @InjectRepository(Template)
    repository: Repository<Template>,
  ) {
    super(repository);
  }

  async findAllPaginated(
    query: ListTemplatesQueryDto,
  ): Promise<PaginatedResult<Template>> {
    const qb = this.repository.createQueryBuilder('t');

    if (query.search) {
      qb.andWhere('(t.slug ILIKE :search OR t.name ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    if (query.isActive !== undefined) {
      qb.andWhere('t.is_active = :isActive', { isActive: query.isActive });
    }

    if (query.channel) {
      qb.andWhere(
        `EXISTS (SELECT 1 FROM template_service.template_channels tc
         WHERE tc.template_version_id = t.current_version_id AND tc.channel = :channel)`,
        { channel: query.channel },
      );
    }

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'DESC';
    const columnMap: Record<string, string> = {
      createdAt: 't.created_at',
      updatedAt: 't.updated_at',
      name: 't.name',
      slug: 't.slug',
    };
    qb.orderBy(columnMap[sortBy] ?? 't.created_at', sortOrder);

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async findByIdWithRelations(id: string): Promise<Template | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['versions', 'versions.channels', 'variables'],
    });
  }

  async findBySlug(slug: string): Promise<Template | null> {
    return this.repository.findOne({ where: { slug } });
  }

  async existsBySlug(slug: string, excludeId?: string): Promise<boolean> {
    const qb = this.repository
      .createQueryBuilder('t')
      .where('t.slug = :slug', { slug });

    if (excludeId) {
      qb.andWhere('t.id != :excludeId', { excludeId });
    }

    return (await qb.getCount()) > 0;
  }

  async save(entity: Template): Promise<Template> {
    return this.repository.save(entity);
  }

  async create(data: Partial<Template>): Promise<Template> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }
}
