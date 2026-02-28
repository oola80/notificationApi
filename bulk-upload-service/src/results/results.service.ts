import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { UploadsRepository } from '../uploads/uploads.repository.js';
import { UploadRowsRepository } from '../uploads/upload-rows.repository.js';
import { UploadRowStatus } from '../uploads/entities/upload-row.entity.js';

const STATUS_COLUMN_HEADER = '_notification_status';

const STYLES = {
  sent: {
    fill: {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FFE6F4EA' },
    },
    font: { color: { argb: 'FF137333' } },
  },
  failed: {
    fill: {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FFFCE8E6' },
    },
    font: { color: { argb: 'FFC5221F' } },
  },
  skipped: {
    fill: {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FFFEF7E0' },
    },
    font: { color: { argb: 'FFB05A00' } },
  },
};

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);
  private readonly resultDir: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly uploadsRepository: UploadsRepository,
    private readonly uploadRowsRepository: UploadRowsRepository,
  ) {
    this.resultDir = this.configService.get<string>(
      'app.uploadResultDir',
      './uploads/results',
    );
  }

  async generateResult(uploadId: string): Promise<string> {
    const upload = await this.uploadsRepository.findById(uploadId);
    if (!upload || !upload.originalFilePath) {
      throw new Error(`Upload ${uploadId} not found or missing file path`);
    }

    // Step 1: Open original XLSX
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(upload.originalFilePath);
    const worksheet = workbook.getWorksheet(1);
    if (!worksheet) {
      throw new Error('No worksheet found in original file');
    }

    // Step 2: Add _notification_status header
    const headerRow = worksheet.getRow(1);
    const headerCount = headerRow.cellCount;
    const statusColIndex = headerCount + 1;
    headerRow.getCell(statusColIndex).value = STATUS_COLUMN_HEADER;
    headerRow.commit();

    // Step 3: Query all row outcomes
    const rowOutcomes = await this.getAllRowOutcomes(uploadId);

    // Step 4-5: For each data row, set status value and apply styling
    const totalDataRows = worksheet.rowCount - 1;
    for (let rowIdx = 2; rowIdx <= worksheet.rowCount; rowIdx++) {
      const dataRowNumber = rowIdx - 1; // Row number in upload_rows (1-indexed)
      const outcome = rowOutcomes.get(dataRowNumber);
      const row = worksheet.getRow(rowIdx);
      const statusCell = row.getCell(statusColIndex);

      if (!outcome) {
        statusCell.value = 'skipped: No outcome recorded';
        statusCell.fill = STYLES.skipped.fill;
        statusCell.font = STYLES.skipped.font;
      } else if (outcome.status === UploadRowStatus.SUCCEEDED) {
        statusCell.value = 'sent';
        statusCell.fill = STYLES.sent.fill;
        statusCell.font = STYLES.sent.font;
      } else if (outcome.status === UploadRowStatus.FAILED) {
        statusCell.value = `failed: ${outcome.errorMessage || 'Unknown error'}`;
        statusCell.fill = STYLES.failed.fill;
        statusCell.font = STYLES.failed.font;
      } else if (outcome.status === UploadRowStatus.SKIPPED) {
        statusCell.value = `skipped: ${outcome.errorMessage || 'Row skipped'}`;
        statusCell.fill = STYLES.skipped.fill;
        statusCell.font = STYLES.skipped.font;
      } else {
        statusCell.value = 'skipped: Not processed';
        statusCell.fill = STYLES.skipped.fill;
        statusCell.font = STYLES.skipped.font;
      }

      row.commit();
    }

    // Step 6: Save result XLSX
    const resultDirPath = path.join(this.resultDir, uploadId);
    fs.mkdirSync(resultDirPath, { recursive: true });
    const resultFilePath = path.join(resultDirPath, 'result.xlsx');
    await workbook.xlsx.writeFile(resultFilePath);

    this.logger.log(
      `Result file generated: upload=${uploadId} rows=${totalDataRows} path=${resultFilePath}`,
    );

    // Clean up original temp file
    this.cleanupFile(upload.originalFilePath);

    return resultFilePath;
  }

  private async getAllRowOutcomes(
    uploadId: string,
  ): Promise<
    Map<number, { status: UploadRowStatus; errorMessage: string | null }>
  > {
    const outcomes = new Map<
      number,
      { status: UploadRowStatus; errorMessage: string | null }
    >();

    // Fetch all rows for this upload (paginated to avoid memory issues)
    let page = 1;
    const limit = 500;
    let hasMore = true;

    while (hasMore) {
      const result = await this.uploadRowsRepository.findByUploadId(
        uploadId,
        page,
        limit,
      );

      for (const row of result.data) {
        outcomes.set(row.rowNumber, {
          status: row.status,
          errorMessage: row.errorMessage,
        });
      }

      hasMore = result.data.length === limit;
      page++;
    }

    return outcomes;
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
}
