import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  FindOptionsWhere,
  LessThanOrEqual,
  MoreThanOrEqual,
} from 'typeorm';
import {
  PgBaseRepository,
  PaginatedResult,
} from '../common/base/pg-base.repository.js';
import { Upload, UploadStatus } from './entities/upload.entity.js';

const VALID_TRANSITIONS: Record<UploadStatus, UploadStatus[]> = {
  [UploadStatus.QUEUED]: [UploadStatus.PROCESSING, UploadStatus.CANCELLED],
  [UploadStatus.PROCESSING]: [
    UploadStatus.COMPLETED,
    UploadStatus.PARTIAL,
    UploadStatus.FAILED,
    UploadStatus.CANCELLED,
  ],
  [UploadStatus.COMPLETED]: [],
  [UploadStatus.PARTIAL]: [UploadStatus.PROCESSING, UploadStatus.QUEUED],
  [UploadStatus.FAILED]: [UploadStatus.PROCESSING, UploadStatus.QUEUED],
  [UploadStatus.CANCELLED]: [],
};

export interface UploadFilterOptions {
  status?: UploadStatus;
  uploadedBy?: string;
  dateFrom?: Date;
  dateTo?: Date;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

@Injectable()
export class UploadsRepository extends PgBaseRepository<Upload> {
  constructor(
    @InjectRepository(Upload)
    repository: Repository<Upload>,
  ) {
    super(repository);
  }

  async findWithFilters(
    options: UploadFilterOptions,
  ): Promise<PaginatedResult<Upload>> {
    const where: FindOptionsWhere<Upload> = {};

    if (options.status) {
      where.status = options.status;
    }
    if (options.uploadedBy) {
      where.uploadedBy = options.uploadedBy;
    }
    if (options.dateFrom) {
      where.createdAt = MoreThanOrEqual(options.dateFrom);
    }
    if (options.dateTo) {
      where.createdAt = where.createdAt
        ? undefined
        : LessThanOrEqual(options.dateTo);
    }

    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const sortBy = (options.sortBy ?? 'createdAt') as keyof Upload;
    const sortOrder = options.sortOrder ?? 'DESC';

    // Handle combined date range
    if (options.dateFrom && options.dateTo) {
      const qb = this.repository.createQueryBuilder('upload');
      qb.where('upload.created_at >= :dateFrom', {
        dateFrom: options.dateFrom,
      });
      qb.andWhere('upload.created_at <= :dateTo', { dateTo: options.dateTo });
      if (options.status) {
        qb.andWhere('upload.status = :status', { status: options.status });
      }
      if (options.uploadedBy) {
        qb.andWhere('upload.uploaded_by = :uploadedBy', {
          uploadedBy: options.uploadedBy,
        });
      }
      qb.orderBy(`upload.${this.toSnakeCase(sortBy)}`, sortOrder);
      qb.skip((page - 1) * limit);
      qb.take(limit);

      const [data, total] = await qb.getManyAndCount();
      return { data, total, page, limit };
    }

    return this.findWithPagination({
      where,
      page,
      limit,
      order: { [sortBy]: sortOrder } as any,
    });
  }

  async claimNextQueued(): Promise<Upload | null> {
    const result = await this.repository
      .createQueryBuilder('upload')
      .update(Upload)
      .set({
        status: UploadStatus.PROCESSING,
        startedAt: new Date(),
      })
      .where(
        `id = (
          SELECT id FROM bulk_upload_service.uploads
          WHERE status = :status
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )`,
      )
      .setParameter('status', UploadStatus.QUEUED)
      .returning('*')
      .execute();

    if (result.raw && result.raw.length > 0) {
      const row = result.raw[0];
      return this.repository.create({
        id: row.id,
        fileName: row.file_name,
        fileSize: row.file_size,
        totalRows: row.total_rows,
        totalEvents: row.total_events,
        processedRows: row.processed_rows,
        succeededRows: row.succeeded_rows,
        failedRows: row.failed_rows,
        status: row.status,
        uploadedBy: row.uploaded_by,
        originalFilePath: row.original_file_path,
        resultFilePath: row.result_file_path,
        resultGeneratedAt: row.result_generated_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      } as Partial<Upload>);
    }
    return null;
  }

  async updateCounters(
    id: string,
    succeeded: number,
    failed: number,
  ): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(Upload)
      .set({
        processedRows: () => `processed_rows + ${succeeded + failed}`,
        succeededRows: () => `succeeded_rows + ${succeeded}`,
        failedRows: () => `failed_rows + ${failed}`,
      })
      .where('id = :id', { id })
      .execute();
  }

  async updateStatus(
    id: string,
    newStatus: UploadStatus,
  ): Promise<Upload | null> {
    const upload = await this.findById(id);
    if (!upload) {
      return null;
    }

    const allowed = VALID_TRANSITIONS[upload.status];
    if (!allowed || !allowed.includes(newStatus)) {
      return null;
    }

    upload.status = newStatus;
    if (
      newStatus === UploadStatus.COMPLETED ||
      newStatus === UploadStatus.PARTIAL ||
      newStatus === UploadStatus.FAILED
    ) {
      upload.completedAt = new Date();
    }

    return this.repository.save(upload);
  }

  async create(data: Partial<Upload>): Promise<Upload> {
    const upload = this.repository.create(data);
    return this.repository.save(upload);
  }

  async save(upload: Upload): Promise<Upload> {
    return this.repository.save(upload);
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete(id);
  }

  isValidTransition(from: UploadStatus, to: UploadStatus): boolean {
    const allowed = VALID_TRANSITIONS[from];
    return !!allowed && allowed.includes(to);
  }

  private toSnakeCase(str: string): string {
    return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
}
