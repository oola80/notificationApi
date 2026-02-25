import { Injectable, Logger } from '@nestjs/common';
import { RecipientGroupsRepository } from './recipient-groups.repository.js';
import { RecipientGroup } from './entities/recipient-group.entity.js';
import {
  CreateRecipientGroupDto,
  UpdateRecipientGroupDto,
  ListRecipientGroupsQueryDto,
} from './dto/index.js';
import { createErrorResponse } from '../common/errors.js';
import { PaginatedResult } from '../common/base/pg-base.repository.js';

@Injectable()
export class RecipientGroupsService {
  private readonly logger = new Logger(RecipientGroupsService.name);

  constructor(private readonly repository: RecipientGroupsRepository) {}

  async create(dto: CreateRecipientGroupDto): Promise<RecipientGroup> {
    const exists = await this.repository.existsByName(dto.name);
    if (exists) {
      throw createErrorResponse('NES-014');
    }

    const group = await this.repository.create({
      name: dto.name,
      description: dto.description ?? null,
    });

    if (dto.members && dto.members.length > 0) {
      await this.repository.addMembers(
        group.id,
        dto.members.map((m) => ({
          email: m.email,
          phone: m.phone ?? null,
          deviceToken: m.deviceToken ?? null,
          memberName: m.memberName ?? null,
        })),
      );
    }

    const result = await this.repository.findWithMembers(group.id);
    this.logger.log(`Recipient group created: ${group.id} (${group.name})`);
    return result!;
  }

  async findAll(
    query: ListRecipientGroupsQueryDto,
  ): Promise<PaginatedResult<RecipientGroup>> {
    return this.repository.findAllPaginated({
      isActive: query.isActive,
      page: query.page,
      limit: query.limit,
    });
  }

  async findById(id: string): Promise<RecipientGroup> {
    const group = await this.repository.findWithMembers(id);
    if (!group) {
      throw createErrorResponse('NES-004');
    }
    return group;
  }

  async update(
    id: string,
    dto: UpdateRecipientGroupDto,
  ): Promise<RecipientGroup> {
    const group = await this.findById(id);

    if (dto.name !== undefined) {
      const exists = await this.repository.existsByName(dto.name, id);
      if (exists) {
        throw createErrorResponse('NES-014');
      }
      group.name = dto.name;
    }

    if (dto.description !== undefined) {
      group.description = dto.description ?? null;
    }

    await this.repository.save(group);

    if (dto.removeMemberIds && dto.removeMemberIds.length > 0) {
      await this.repository.deactivateMembers(dto.removeMemberIds);
    }

    if (dto.addMembers && dto.addMembers.length > 0) {
      await this.repository.addMembers(
        id,
        dto.addMembers.map((m) => ({
          email: m.email,
          phone: m.phone ?? null,
          deviceToken: m.deviceToken ?? null,
          memberName: m.memberName ?? null,
        })),
      );
    }

    const updated = await this.repository.findWithMembers(id);
    this.logger.log(`Recipient group updated: ${id}`);
    return updated!;
  }
}
