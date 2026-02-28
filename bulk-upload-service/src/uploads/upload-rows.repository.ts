import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  PgBaseRepository,
  PaginatedResult,
} from '../common/base/pg-base.repository.js';
import { UploadRow, UploadRowStatus } from './entities/upload-row.entity.js';

@Injectable()
export class UploadRowsRepository extends PgBaseRepository<UploadRow> {
  constructor(
    @InjectRepository(UploadRow)
    repository: Repository<UploadRow>,
  ) {
    super(repository);
  }

  async bulkInsert(rows: Partial<UploadRow>[]): Promise<void> {
    if (rows.length === 0) return;
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(UploadRow)
      .values(rows as any)
      .execute();
  }

  async findByUploadId(
    uploadId: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<UploadRow>> {
    return this.findWithPagination({
      where: { uploadId },
      page,
      limit,
      order: { rowNumber: 'ASC' } as any,
    });
  }

  async findFailedByUploadId(
    uploadId: string,
    page = 1,
    limit = 50,
  ): Promise<PaginatedResult<UploadRow>> {
    return this.findWithPagination({
      where: [
        { uploadId, status: UploadRowStatus.FAILED },
        { uploadId, status: UploadRowStatus.SKIPPED },
      ],
      page,
      limit,
      order: { rowNumber: 'ASC' } as any,
    });
  }

  async updateRowStatus(
    id: string,
    status: UploadRowStatus,
    errorMessage?: string,
    eventId?: string,
  ): Promise<void> {
    const updateData: Partial<UploadRow> = {
      status,
      processedAt: new Date(),
    };
    if (errorMessage !== undefined) {
      updateData.errorMessage = errorMessage;
    }
    if (eventId !== undefined) {
      updateData.eventId = eventId;
    }
    await this.repository.update(id, updateData);
  }

  async countByStatus(
    uploadId: string,
  ): Promise<Record<string, number>> {
    const results = await this.repository
      .createQueryBuilder('row')
      .select('row.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .where('row.upload_id = :uploadId', { uploadId })
      .groupBy('row.status')
      .getRawMany<{ status: string; count: number }>();

    const counts: Record<string, number> = {};
    for (const row of results) {
      counts[row.status] = row.count;
    }
    return counts;
  }

  async findPendingBatch(
    uploadId: string,
    limit = 50,
    offset = 0,
  ): Promise<PaginatedResult<UploadRow>> {
    const [data, total] = await this.repository.findAndCount({
      where: { uploadId, status: UploadRowStatus.PENDING },
      order: { rowNumber: 'ASC' },
      skip: offset,
      take: limit,
    });

    return { data, total, page: 1, limit };
  }

  async resetFailedRows(uploadId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(UploadRow)
      .set({
        status: UploadRowStatus.PENDING,
        errorMessage: null as any,
        processedAt: null as any,
      })
      .where('upload_id = :uploadId', { uploadId })
      .andWhere('status IN (:...statuses)', {
        statuses: [UploadRowStatus.FAILED, UploadRowStatus.SKIPPED],
      })
      .execute();

    return result.affected ?? 0;
  }

  async updateGroupRowStatuses(
    uploadId: string,
    groupKey: string,
    status: UploadRowStatus,
    errorMessage?: string,
    eventId?: string,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      status,
      processedAt: new Date(),
    };
    if (errorMessage !== undefined) {
      updateData.errorMessage = errorMessage;
    }
    if (eventId !== undefined) {
      updateData.eventId = eventId;
    }

    await this.repository
      .createQueryBuilder()
      .update(UploadRow)
      .set(updateData as any)
      .where('upload_id = :uploadId', { uploadId })
      .andWhere('group_key = :groupKey', { groupKey })
      .execute();
  }

  async deleteByUploadId(uploadId: string): Promise<void> {
    await this.repository.delete({ uploadId });
  }
}
