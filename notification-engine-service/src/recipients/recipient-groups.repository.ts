import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { RecipientGroup } from './entities/recipient-group.entity.js';
import { RecipientGroupMember } from './entities/recipient-group-member.entity.js';

@Injectable()
export class RecipientGroupsRepository extends PgBaseRepository<RecipientGroup> {
  constructor(
    @InjectRepository(RecipientGroup)
    repository: Repository<RecipientGroup>,
    @InjectRepository(RecipientGroupMember)
    private readonly memberRepository: Repository<RecipientGroupMember>,
  ) {
    super(repository);
  }

  async findWithMembers(id: string): Promise<RecipientGroup | null> {
    const group = await this.repository.findOne({
      where: { id },
      relations: ['members'],
    });

    if (group) {
      group.members = group.members.filter((m) => m.isActive);
    }

    return group;
  }

  async findAllPaginated(query: {
    isActive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const where: any = {};
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    return this.findWithPagination({
      where,
      page: query.page,
      limit: query.limit,
      order: { createdAt: 'DESC' },
    });
  }

  async create(data: Partial<RecipientGroup>): Promise<RecipientGroup> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async save(entity: RecipientGroup): Promise<RecipientGroup> {
    return this.repository.save(entity);
  }

  async addMembers(
    groupId: string,
    members: Partial<RecipientGroupMember>[],
  ): Promise<RecipientGroupMember[]> {
    const entities = members.map((m) =>
      this.memberRepository.create({ ...m, groupId }),
    );
    return this.memberRepository.save(entities);
  }

  async deactivateMembers(memberIds: number[]): Promise<void> {
    if (memberIds.length === 0) return;
    await this.memberRepository.update(
      { id: In(memberIds) },
      { isActive: false },
    );
  }

  async findActiveMembers(groupId: string): Promise<RecipientGroupMember[]> {
    return this.memberRepository.find({
      where: { groupId, isActive: true },
    });
  }

  async existsByName(name: string, excludeId?: string): Promise<boolean> {
    const qb = this.repository
      .createQueryBuilder('group')
      .where('group.name = :name', { name });

    if (excludeId) {
      qb.andWhere('group.id != :excludeId', { excludeId });
    }

    return (await qb.getCount()) > 0;
  }
}
