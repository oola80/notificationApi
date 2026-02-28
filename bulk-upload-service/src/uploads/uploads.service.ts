import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { createErrorResponse } from '../common/errors.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { UploadsRepository, UploadFilterOptions } from './uploads.repository.js';
import { UploadRowsRepository } from './upload-rows.repository.js';
import { Upload, UploadStatus } from './entities/upload.entity.js';
import { UploadRowStatus } from './entities/upload-row.entity.js';
import { UploadResponseDto } from './dto/upload-response.dto.js';
import { UploadStatusResponseDto } from './dto/upload-status-response.dto.js';
import { QueryUploadsDto } from './dto/query-uploads.dto.js';
import { ErrorRowsQueryDto } from './dto/error-rows-query.dto.js';
import { PaginatedResult } from '../common/base/pg-base.repository.js';
import {
  AuditPublisherService,
  AuditUploadData,
} from '../rabbitmq/audit-publisher.service.js';

export interface UploadValidationResult {
  totalRows: number;
  headers: string[];
  hasItemColumns: boolean;
  groupKeyColumn: string | null;
}

@Injectable()
export class UploadsService {
  private readonly maxFileSizeBytes: number;
  private readonly maxRows: number;
  private readonly uploadTempDir: string;
  private readonly groupKeyColumn: string;
  private readonly groupItemsPrefix: string;

  constructor(
    private readonly uploadsRepository: UploadsRepository,
    private readonly uploadRowsRepository: UploadRowsRepository,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
    private readonly auditPublisher: AuditPublisherService,
  ) {
    this.maxFileSizeBytes =
      this.configService.get<number>('app.uploadMaxFileSizeMb', 10) *
      1024 *
      1024;
    this.maxRows = this.configService.get<number>('app.uploadMaxRows', 5000);
    this.uploadTempDir = this.configService.get<string>(
      'app.uploadTempDir',
      './uploads/temp',
    );
    this.groupKeyColumn = this.configService.get<string>(
      'app.groupKeyColumn',
      'orderId',
    );
    this.groupItemsPrefix = this.configService.get<string>(
      'app.groupItemsPrefix',
      'item.',
    );
  }

  async processUpload(
    file: Express.Multer.File,
    uploadedBy: string,
  ): Promise<UploadResponseDto> {
    // 1. File extension check
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx') {
      this.cleanupFile(file.path);
      throw createErrorResponse('BUS-003');
    }

    // 2. MIME type check
    const validMime =
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (file.mimetype !== validMime) {
      this.cleanupFile(file.path);
      throw createErrorResponse('BUS-013');
    }

    // 3. File size check
    if (file.size > this.maxFileSizeBytes) {
      this.cleanupFile(file.path);
      throw createErrorResponse(
        'BUS-004',
        `File size exceeds ${this.configService.get<number>('app.uploadMaxFileSizeMb', 10)} MB limit`,
      );
    }

    // 4-8. XLSX content validation
    let validation: UploadValidationResult;
    try {
      validation = await this.validateXlsxContent(file.path);
    } catch (error) {
      this.cleanupFile(file.path);
      throw error;
    }

    // Move file to permanent temp storage
    const uploadId = require('uuid').v4();
    const uploadDir = path.join(this.uploadTempDir, uploadId);
    const permanentPath = path.join(uploadDir, 'original.xlsx');

    try {
      fs.mkdirSync(uploadDir, { recursive: true });
      fs.copyFileSync(file.path, permanentPath);
      this.cleanupFile(file.path);
    } catch {
      this.cleanupFile(file.path);
      throw createErrorResponse('BUS-009', 'Failed to store uploaded file');
    }

    // Create upload record
    const upload = await this.uploadsRepository.create({
      id: uploadId,
      fileName: file.originalname,
      fileSize: file.size,
      totalRows: validation.totalRows,
      status: UploadStatus.QUEUED,
      uploadedBy,
      originalFilePath: permanentPath,
    });

    this.metricsService.incrementUploads('queued');
    this.metricsService.observeFileSize(file.size);

    try {
      this.auditPublisher.publishUploadCreated({
        uploadId: upload.id,
        fileName: upload.fileName,
        uploadedBy: upload.uploadedBy,
        status: upload.status,
        totalRows: upload.totalRows,
        processedRows: 0,
        succeededRows: 0,
        failedRows: 0,
      });
    } catch {
      // Fire-and-forget — never block on publish failure
    }

    return UploadResponseDto.fromEntity(upload);
  }

  async validateXlsxContent(filePath: string): Promise<UploadValidationResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      throw createErrorResponse('BUS-011', 'Missing header row');
    }

    // 4. Header row present
    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const value = cell.value;
      if (value !== null && value !== undefined) {
        headers.push(String(value));
      }
    });

    if (headers.length === 0) {
      throw createErrorResponse('BUS-011', 'Missing header row');
    }

    // 5. eventType column required
    if (!headers.includes('eventType')) {
      throw createErrorResponse(
        'BUS-005',
        "Missing required 'eventType' column",
      );
    }

    // 6. If item.* columns → group key column must exist
    const itemColumns = headers.filter((h) =>
      h.startsWith(this.groupItemsPrefix),
    );
    const hasItemColumns = itemColumns.length > 0;
    let groupKeyColumn: string | null = null;

    if (hasItemColumns) {
      if (!headers.includes(this.groupKeyColumn)) {
        throw createErrorResponse(
          'BUS-012',
          `Group mode detected (item.* columns found) but required group key column '${this.groupKeyColumn}' is missing`,
        );
      }
      groupKeyColumn = this.groupKeyColumn;
    }

    // 7-8. Count data rows
    const totalRows = worksheet.rowCount - 1; // exclude header
    if (totalRows <= 0) {
      throw createErrorResponse('BUS-007', 'File contains no data rows');
    }
    if (totalRows > this.maxRows) {
      throw createErrorResponse(
        'BUS-006',
        `File exceeds ${this.maxRows} row limit (found ${totalRows} rows)`,
      );
    }

    return { totalRows, headers, hasItemColumns, groupKeyColumn };
  }

  async findAll(query: QueryUploadsDto): Promise<{
    data: UploadResponseDto[];
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const filterOptions: UploadFilterOptions = {
      status: query.status,
      uploadedBy: query.uploadedBy,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder?.toUpperCase() as 'ASC' | 'DESC',
    };

    const result = await this.uploadsRepository.findWithFilters(filterOptions);

    return {
      data: result.data.map(UploadResponseDto.fromEntity),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    };
  }

  async findById(id: string): Promise<UploadResponseDto> {
    const upload = await this.uploadsRepository.findById(id);
    if (!upload) {
      throw createErrorResponse('BUS-002');
    }
    return UploadResponseDto.fromEntity(upload);
  }

  async getStatus(id: string): Promise<UploadStatusResponseDto> {
    const upload = await this.uploadsRepository.findById(id);
    if (!upload) {
      throw createErrorResponse('BUS-002');
    }
    return UploadStatusResponseDto.fromEntity(upload);
  }

  async getErrors(
    id: string,
    query: ErrorRowsQueryDto,
  ): Promise<{
    data: Array<{
      rowNumber: number;
      rawData: Record<string, any>;
      errorMessage: string | null;
      status: string;
    }>;
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const upload = await this.uploadsRepository.findById(id);
    if (!upload) {
      throw createErrorResponse('BUS-002');
    }

    const result = await this.uploadRowsRepository.findFailedByUploadId(
      id,
      query.page,
      query.limit,
    );

    return {
      data: result.data.map((row) => ({
        rowNumber: row.rowNumber,
        rawData: row.rawData,
        errorMessage: row.errorMessage,
        status: row.status,
      })),
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    };
  }

  async retryUpload(
    id: string,
  ): Promise<{ uploadId: string; status: string; retryableRows: number }> {
    const upload = await this.uploadsRepository.findById(id);
    if (!upload) {
      throw createErrorResponse('BUS-002');
    }

    // Only partial or failed uploads can be retried
    if (
      upload.status !== UploadStatus.PARTIAL &&
      upload.status !== UploadStatus.FAILED
    ) {
      throw createErrorResponse('BUS-016');
    }

    // Reset failed/skipped rows to pending
    const resetCount = await this.uploadRowsRepository.resetFailedRows(id);

    // Reset upload counters: keep succeeded count, zero failed
    upload.processedRows = upload.succeededRows;
    upload.failedRows = 0;
    upload.status = UploadStatus.QUEUED;
    upload.completedAt = null;
    upload.resultFilePath = null;
    upload.resultGeneratedAt = null;
    await this.uploadsRepository.save(upload);

    this.metricsService.incrementRetry();

    try {
      this.auditPublisher.publishUploadRetried({
        uploadId: id,
        fileName: upload.fileName,
        uploadedBy: upload.uploadedBy,
        status: 'queued',
        totalRows: upload.totalRows,
        processedRows: upload.processedRows,
        succeededRows: upload.succeededRows,
        failedRows: resetCount,
      });
    } catch {
      // Fire-and-forget
    }

    return {
      uploadId: id,
      status: 'queued',
      retryableRows: resetCount,
    };
  }

  async cancelOrDelete(id: string): Promise<void> {
    const upload = await this.uploadsRepository.findById(id);
    if (!upload) {
      throw createErrorResponse('BUS-002');
    }

    if (
      upload.status === UploadStatus.QUEUED ||
      upload.status === UploadStatus.PROCESSING
    ) {
      // Cancel the upload
      const updated = await this.uploadsRepository.updateStatus(
        id,
        UploadStatus.CANCELLED,
      );
      if (!updated) {
        throw createErrorResponse(
          'BUS-008',
          `Cannot transition from '${upload.status}' to 'cancelled'`,
        );
      }
      this.metricsService.incrementUploads('cancelled');

      try {
        this.auditPublisher.publishUploadCancelled({
          uploadId: id,
          fileName: upload.fileName,
          uploadedBy: upload.uploadedBy,
          status: 'cancelled',
          totalRows: upload.totalRows,
          processedRows: upload.processedRows,
          succeededRows: upload.succeededRows,
          failedRows: upload.failedRows,
        });
      } catch {
        // Fire-and-forget
      }
    } else {
      // Terminal state — delete record + files
      if (upload.originalFilePath) {
        this.cleanupFile(upload.originalFilePath);
        this.cleanupDir(path.dirname(upload.originalFilePath));
      }
      if (upload.resultFilePath) {
        this.cleanupFile(upload.resultFilePath);
        this.cleanupDir(path.dirname(upload.resultFilePath));
      }
      await this.uploadsRepository.delete(id);
    }
  }

  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  private cleanupDir(dirPath: string): void {
    try {
      if (fs.existsSync(dirPath)) {
        fs.rmdirSync(dirPath, { recursive: true } as any);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
