import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import { AuditExportService } from './audit-export.service.js';
import { AuditEventsRepository, ExportRow } from './audit-events.repository.js';
import { ExportAuditLogsQueryDto } from './dto/export-audit-logs-query.dto.js';

describe('AuditExportService', () => {
  let service: AuditExportService;
  let repository: jest.Mocked<AuditEventsRepository>;
  let configService: jest.Mocked<ConfigService>;

  const mockExportRow = (overrides?: Partial<ExportRow>): ExportRow => ({
    createdAt: '2026-03-10T12:00:00.000Z',
    notificationId: 'n-001',
    correlationId: 'c-001',
    cycleId: 'cy-001',
    eventType: 'delivery.sent',
    actor: 'channel-router-service',
    metadata: { key: 'value' },
    channel: 'email',
    provider: 'mailgun',
    deliveryStatus: 'delivered',
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditExportService,
        {
          provide: AuditEventsRepository,
          useValue: {
            findForExport: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(50000),
          },
        },
      ],
    }).compile();

    service = module.get<AuditExportService>(AuditExportService);
    repository = module.get(AuditEventsRepository);
    configService = module.get(ConfigService);
  });

  describe('generateExportWorkbook', () => {
    const baseQuery: ExportAuditLogsQueryDto = {
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-10T23:59:59.999Z',
    };

    it('should generate a workbook with header and data rows', async () => {
      const rows = [mockExportRow(), mockExportRow({ notificationId: 'n-002' })];
      repository.findForExport.mockResolvedValue({ rows, totalCount: 2 });

      const result = await service.generateExportWorkbook(baseQuery);

      expect(result.workbook).toBeInstanceOf(ExcelJS.Workbook);
      expect(result.truncated).toBe(false);
      expect(result.totalCount).toBe(2);

      const worksheet = result.workbook.getWorksheet('Audit Logs');
      expect(worksheet).toBeDefined();
      // Header row + 2 data rows
      expect(worksheet!.rowCount).toBe(3);
    });

    it('should apply green styling for delivered status', async () => {
      const rows = [mockExportRow({ deliveryStatus: 'delivered' })];
      repository.findForExport.mockResolvedValue({ rows, totalCount: 1 });

      const result = await service.generateExportWorkbook(baseQuery);
      const worksheet = result.workbook.getWorksheet('Audit Logs')!;
      const dataRow = worksheet.getRow(2);
      const fill = dataRow.getCell(1).fill as ExcelJS.FillPattern;

      expect(fill.fgColor?.argb).toBe('FFE6F4EA');
    });

    it('should apply green styling for sent status', async () => {
      const rows = [mockExportRow({ deliveryStatus: 'sent' })];
      repository.findForExport.mockResolvedValue({ rows, totalCount: 1 });

      const result = await service.generateExportWorkbook(baseQuery);
      const worksheet = result.workbook.getWorksheet('Audit Logs')!;
      const dataRow = worksheet.getRow(2);
      const fill = dataRow.getCell(1).fill as ExcelJS.FillPattern;

      expect(fill.fgColor?.argb).toBe('FFE6F4EA');
    });

    it('should apply red styling for failed status', async () => {
      const rows = [mockExportRow({ deliveryStatus: 'failed' })];
      repository.findForExport.mockResolvedValue({ rows, totalCount: 1 });

      const result = await service.generateExportWorkbook(baseQuery);
      const worksheet = result.workbook.getWorksheet('Audit Logs')!;
      const dataRow = worksheet.getRow(2);
      const fill = dataRow.getCell(1).fill as ExcelJS.FillPattern;

      expect(fill.fgColor?.argb).toBe('FFFCE8E6');
    });

    it('should apply orange styling for bounced status', async () => {
      const rows = [mockExportRow({ deliveryStatus: 'bounced' })];
      repository.findForExport.mockResolvedValue({ rows, totalCount: 1 });

      const result = await service.generateExportWorkbook(baseQuery);
      const worksheet = result.workbook.getWorksheet('Audit Logs')!;
      const dataRow = worksheet.getRow(2);
      const fill = dataRow.getCell(1).fill as ExcelJS.FillPattern;

      expect(fill.fgColor?.argb).toBe('FFFEF7E0');
    });

    it('should apply orange styling for suppressed status', async () => {
      const rows = [mockExportRow({ deliveryStatus: 'suppressed' })];
      repository.findForExport.mockResolvedValue({ rows, totalCount: 1 });

      const result = await service.generateExportWorkbook(baseQuery);
      const worksheet = result.workbook.getWorksheet('Audit Logs')!;
      const dataRow = worksheet.getRow(2);
      const fill = dataRow.getCell(1).fill as ExcelJS.FillPattern;

      expect(fill.fgColor?.argb).toBe('FFFEF7E0');
    });

    it('should not apply status styling for rows without delivery status', async () => {
      const rows = [mockExportRow({ deliveryStatus: null })];
      repository.findForExport.mockResolvedValue({ rows, totalCount: 1 });

      const result = await service.generateExportWorkbook(baseQuery);
      const worksheet = result.workbook.getWorksheet('Audit Logs')!;
      const dataRow = worksheet.getRow(2);
      const fill = dataRow.getCell(1).fill;

      // No fill applied (default undefined)
      expect(fill).toBeUndefined();
    });

    it('should add truncation warning when totalCount exceeds maxRows', async () => {
      configService.get.mockReturnValue(2);
      const rows = [mockExportRow(), mockExportRow({ notificationId: 'n-002' })];
      repository.findForExport.mockResolvedValue({ rows, totalCount: 5 });

      const result = await service.generateExportWorkbook(baseQuery);

      expect(result.truncated).toBe(true);
      expect(result.totalCount).toBe(5);

      const worksheet = result.workbook.getWorksheet('Audit Logs')!;
      // Header + 2 data rows + 1 warning row
      expect(worksheet.rowCount).toBe(4);

      const warningRow = worksheet.getRow(4);
      const warningText = String(warningRow.getCell(1).value);
      expect(warningText).toContain('truncated');
    });

    it('should produce header-only workbook for empty results', async () => {
      repository.findForExport.mockResolvedValue({ rows: [], totalCount: 0 });

      const result = await service.generateExportWorkbook(baseQuery);
      const worksheet = result.workbook.getWorksheet('Audit Logs')!;

      expect(worksheet.rowCount).toBe(1); // Header only
      expect(result.truncated).toBe(false);
    });

    it('should throw AUD-004 when date range exceeds 90 days', async () => {
      const query: ExportAuditLogsQueryDto = {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-06-01T00:00:00.000Z',
      };

      await expect(service.generateExportWorkbook(query)).rejects.toThrow();
    });

    it('should pass filters to repository', async () => {
      repository.findForExport.mockResolvedValue({ rows: [], totalCount: 0 });

      const query: ExportAuditLogsQueryDto = {
        from: '2026-03-01T00:00:00.000Z',
        to: '2026-03-10T00:00:00.000Z',
        eventType: 'delivery.sent',
        actor: 'channel-router-service',
        notificationId: 'n-001',
      };

      await service.generateExportWorkbook(query);

      expect(repository.findForExport).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'delivery.sent',
          actor: 'channel-router-service',
          notificationId: 'n-001',
          from: '2026-03-01T00:00:00.000Z',
          to: '2026-03-10T00:00:00.000Z',
        }),
        50000,
      );
    });

    it('should serialize metadata as JSON string', async () => {
      const meta = { recipient: 'test@example.com', templateId: 't-001' };
      const rows = [mockExportRow({ metadata: meta })];
      repository.findForExport.mockResolvedValue({ rows, totalCount: 1 });

      const result = await service.generateExportWorkbook(baseQuery);
      const worksheet = result.workbook.getWorksheet('Audit Logs')!;
      const dataRow = worksheet.getRow(2);
      const metadataCell = dataRow.getCell('metadata');

      expect(metadataCell.value).toBe(JSON.stringify(meta));
    });
  });
});
