import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ResultsService } from './results.service.js';
import { UploadsRepository } from '../uploads/uploads.repository.js';
import { UploadRowsRepository } from '../uploads/upload-rows.repository.js';
import { Upload, UploadStatus } from '../uploads/entities/upload.entity.js';
import { UploadRowStatus } from '../uploads/entities/upload-row.entity.js';

describe('ResultsService', () => {
  let service: ResultsService;
  let configService: jest.Mocked<ConfigService>;
  let uploadsRepository: jest.Mocked<UploadsRepository>;
  let uploadRowsRepository: jest.Mocked<UploadRowsRepository>;
  let tempDir: string;
  let resultDir: string;

  const mockUpload: Upload = {
    id: 'upload-result-test',
    fileName: 'test.xlsx',
    fileSize: 1024,
    totalRows: 3,
    totalEvents: null,
    processedRows: 3,
    succeededRows: 2,
    failedRows: 1,
    status: UploadStatus.PARTIAL,
    uploadedBy: '00000000-0000-0000-0000-000000000000',
    originalFilePath: '',
    resultFilePath: null,
    resultGeneratedAt: null,
    startedAt: new Date(),
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'results-test-'));
    resultDir = path.join(tempDir, 'results');
    fs.mkdirSync(resultDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    configService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'app.uploadResultDir') return resultDir;
        return defaultValue;
      }),
    } as any;

    uploadsRepository = {
      findById: jest.fn(),
    } as any;

    uploadRowsRepository = {
      findByUploadId: jest.fn(),
    } as any;

    service = new ResultsService(
      configService,
      uploadsRepository,
      uploadRowsRepository,
    );
  });

  async function createTestXlsx(
    headers: string[],
    rows: any[][],
  ): Promise<string> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Sheet1');
    sheet.addRow(headers);
    for (const row of rows) {
      sheet.addRow(row);
    }
    const filePath = path.join(tempDir, `original-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  describe('generateResult', () => {
    it('should generate result file with _notification_status column', async () => {
      const originalPath = await createTestXlsx(
        ['eventType', 'email', 'name'],
        [
          ['order.created', 'jane@example.com', 'Jane'],
          ['order.shipped', 'john@example.com', 'John'],
          ['order.unknown', 'bob@example.com', 'Bob'],
        ],
      );

      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        originalFilePath: originalPath,
      });

      uploadRowsRepository.findByUploadId.mockResolvedValueOnce({
        data: [
          {
            id: 'r-1',
            uploadId: mockUpload.id,
            rowNumber: 1,
            groupKey: null,
            rawData: {},
            mappedPayload: null,
            eventId: 'evt-1',
            status: UploadRowStatus.SUCCEEDED,
            errorMessage: null,
            processedAt: new Date(),
            upload: mockUpload,
          },
          {
            id: 'r-2',
            uploadId: mockUpload.id,
            rowNumber: 2,
            groupKey: null,
            rawData: {},
            mappedPayload: null,
            eventId: 'evt-2',
            status: UploadRowStatus.SUCCEEDED,
            errorMessage: null,
            processedAt: new Date(),
            upload: mockUpload,
          },
          {
            id: 'r-3',
            uploadId: mockUpload.id,
            rowNumber: 3,
            groupKey: null,
            rawData: {},
            mappedPayload: null,
            eventId: null,
            status: UploadRowStatus.FAILED,
            errorMessage: 'No mapping found',
            processedAt: new Date(),
            upload: mockUpload,
          },
        ],
        total: 3,
        page: 1,
        limit: 500,
      }).mockResolvedValueOnce({
        data: [],
        total: 3,
        page: 2,
        limit: 500,
      });

      const resultPath = await service.generateResult(mockUpload.id);

      expect(resultPath).toContain('result.xlsx');
      expect(fs.existsSync(resultPath)).toBe(true);

      // Verify result file content
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(resultPath);
      const sheet = workbook.getWorksheet(1)!;

      // Header should have _notification_status
      const headerRow = sheet.getRow(1);
      expect(headerRow.getCell(4).value).toBe('_notification_status');

      // Row 2 (data row 1) — sent
      const row2 = sheet.getRow(2);
      expect(row2.getCell(4).value).toBe('sent');

      // Row 3 (data row 2) — sent
      const row3 = sheet.getRow(3);
      expect(row3.getCell(4).value).toBe('sent');

      // Row 4 (data row 3) — failed
      const row4 = sheet.getRow(4);
      expect(row4.getCell(4).value).toBe('failed: No mapping found');
    });

    it('should apply correct styling to sent cells', async () => {
      const originalPath = await createTestXlsx(
        ['eventType', 'email'],
        [['order.created', 'test@example.com']],
      );

      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        originalFilePath: originalPath,
      });

      uploadRowsRepository.findByUploadId.mockResolvedValueOnce({
        data: [
          {
            id: 'r-1',
            uploadId: mockUpload.id,
            rowNumber: 1,
            groupKey: null,
            rawData: {},
            mappedPayload: null,
            eventId: 'evt-1',
            status: UploadRowStatus.SUCCEEDED,
            errorMessage: null,
            processedAt: new Date(),
            upload: mockUpload,
          },
        ],
        total: 1,
        page: 1,
        limit: 500,
      }).mockResolvedValueOnce({
        data: [],
        total: 1,
        page: 2,
        limit: 500,
      });

      const resultPath = await service.generateResult(mockUpload.id);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(resultPath);
      const sheet = workbook.getWorksheet(1)!;
      const statusCell = sheet.getRow(2).getCell(3);

      expect(statusCell.value).toBe('sent');
      expect((statusCell.fill as any).fgColor?.argb).toBe('FFE6F4EA');
      expect(statusCell.font?.color?.argb).toBe('FF137333');
    });

    it('should apply correct styling to failed cells', async () => {
      const originalPath = await createTestXlsx(
        ['eventType', 'email'],
        [['order.created', 'test@example.com']],
      );

      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        originalFilePath: originalPath,
      });

      uploadRowsRepository.findByUploadId.mockResolvedValueOnce({
        data: [
          {
            id: 'r-1',
            uploadId: mockUpload.id,
            rowNumber: 1,
            groupKey: null,
            rawData: {},
            mappedPayload: null,
            eventId: null,
            status: UploadRowStatus.FAILED,
            errorMessage: 'Validation error',
            processedAt: new Date(),
            upload: mockUpload,
          },
        ],
        total: 1,
        page: 1,
        limit: 500,
      }).mockResolvedValueOnce({
        data: [],
        total: 1,
        page: 2,
        limit: 500,
      });

      const resultPath = await service.generateResult(mockUpload.id);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(resultPath);
      const sheet = workbook.getWorksheet(1)!;
      const statusCell = sheet.getRow(2).getCell(3);

      expect(statusCell.value).toBe('failed: Validation error');
      expect((statusCell.fill as any).fgColor?.argb).toBe('FFFCE8E6');
      expect(statusCell.font?.color?.argb).toBe('FFC5221F');
    });

    it('should apply correct styling to skipped cells', async () => {
      const originalPath = await createTestXlsx(
        ['eventType', 'email'],
        [['', 'test@example.com']],
      );

      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        originalFilePath: originalPath,
      });

      uploadRowsRepository.findByUploadId.mockResolvedValueOnce({
        data: [
          {
            id: 'r-1',
            uploadId: mockUpload.id,
            rowNumber: 1,
            groupKey: null,
            rawData: {},
            mappedPayload: null,
            eventId: null,
            status: UploadRowStatus.SKIPPED,
            errorMessage: "Missing required 'eventType' value",
            processedAt: new Date(),
            upload: mockUpload,
          },
        ],
        total: 1,
        page: 1,
        limit: 500,
      }).mockResolvedValueOnce({
        data: [],
        total: 1,
        page: 2,
        limit: 500,
      });

      const resultPath = await service.generateResult(mockUpload.id);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(resultPath);
      const sheet = workbook.getWorksheet(1)!;
      const statusCell = sheet.getRow(2).getCell(3);

      expect(statusCell.value).toBe(
        "skipped: Missing required 'eventType' value",
      );
      expect((statusCell.fill as any).fgColor?.argb).toBe('FFFEF7E0');
      expect(statusCell.font?.color?.argb).toBe('FFB05A00');
    });

    it('should throw when upload not found', async () => {
      uploadsRepository.findById.mockResolvedValue(null);

      await expect(
        service.generateResult('nonexistent'),
      ).rejects.toThrow('Upload nonexistent not found or missing file path');
    });

    it('should throw when upload has no file path', async () => {
      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        originalFilePath: null,
      });

      await expect(
        service.generateResult(mockUpload.id),
      ).rejects.toThrow('not found or missing file path');
    });

    it('should handle rows without outcome (pending)', async () => {
      const originalPath = await createTestXlsx(
        ['eventType', 'email'],
        [['order.created', 'test@example.com']],
      );

      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        originalFilePath: originalPath,
      });

      // No row outcomes returned
      uploadRowsRepository.findByUploadId.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 500,
      });

      const resultPath = await service.generateResult(mockUpload.id);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(resultPath);
      const sheet = workbook.getWorksheet(1)!;
      const statusCell = sheet.getRow(2).getCell(3);

      expect(statusCell.value).toBe('skipped: No outcome recorded');
    });

    it('should clean up original file after generation', async () => {
      const originalPath = await createTestXlsx(
        ['eventType', 'email'],
        [['order.created', 'test@example.com']],
      );

      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        originalFilePath: originalPath,
      });

      uploadRowsRepository.findByUploadId.mockResolvedValueOnce({
        data: [
          {
            id: 'r-1',
            uploadId: mockUpload.id,
            rowNumber: 1,
            groupKey: null,
            rawData: {},
            mappedPayload: null,
            eventId: 'evt-1',
            status: UploadRowStatus.SUCCEEDED,
            errorMessage: null,
            processedAt: new Date(),
            upload: mockUpload,
          },
        ],
        total: 1,
        page: 1,
        limit: 500,
      }).mockResolvedValueOnce({
        data: [],
        total: 1,
        page: 2,
        limit: 500,
      });

      await service.generateResult(mockUpload.id);

      expect(fs.existsSync(originalPath)).toBe(false);
    });

    it('should preserve original data columns in result file', async () => {
      const originalPath = await createTestXlsx(
        ['eventType', 'email', 'name', 'amount'],
        [['order.created', 'jane@example.com', 'Jane', 79.99]],
      );

      uploadsRepository.findById.mockResolvedValue({
        ...mockUpload,
        originalFilePath: originalPath,
      });

      uploadRowsRepository.findByUploadId.mockResolvedValueOnce({
        data: [
          {
            id: 'r-1',
            uploadId: mockUpload.id,
            rowNumber: 1,
            groupKey: null,
            rawData: {},
            mappedPayload: null,
            eventId: 'evt-1',
            status: UploadRowStatus.SUCCEEDED,
            errorMessage: null,
            processedAt: new Date(),
            upload: mockUpload,
          },
        ],
        total: 1,
        page: 1,
        limit: 500,
      }).mockResolvedValueOnce({
        data: [],
        total: 1,
        page: 2,
        limit: 500,
      });

      const resultPath = await service.generateResult(mockUpload.id);

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(resultPath);
      const sheet = workbook.getWorksheet(1)!;

      // Original headers preserved
      const headerRow = sheet.getRow(1);
      expect(headerRow.getCell(1).value).toBe('eventType');
      expect(headerRow.getCell(2).value).toBe('email');
      expect(headerRow.getCell(3).value).toBe('name');
      expect(headerRow.getCell(4).value).toBe('amount');
      expect(headerRow.getCell(5).value).toBe('_notification_status');

      // Original data preserved
      const dataRow = sheet.getRow(2);
      expect(dataRow.getCell(1).value).toBe('order.created');
      expect(dataRow.getCell(2).value).toBe('jane@example.com');
      expect(dataRow.getCell(3).value).toBe('Jane');
      expect(dataRow.getCell(4).value).toBe(79.99);
    });
  });
});
