import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ExcelJS from 'exceljs';
import { AuditEventsRepository, ExportRow } from './audit-events.repository.js';
import { ExportAuditLogsQueryDto } from './dto/export-audit-logs-query.dto.js';
import { createErrorResponse } from '../common/errors.js';

const MAX_DATE_RANGE_DAYS = 90;

const HEADER_STYLE: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1A73E8' },
  },
  alignment: { horizontal: 'center' },
};

const STATUS_STYLES: Record<
  string,
  { fill: ExcelJS.Fill; font: Partial<ExcelJS.Font> }
> = {
  delivered: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4EA' } },
    font: { color: { argb: 'FF137333' } },
  },
  sent: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4EA' } },
    font: { color: { argb: 'FF137333' } },
  },
  failed: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE8E6' } },
    font: { color: { argb: 'FFC5221F' } },
  },
  bounced: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF7E0' } },
    font: { color: { argb: 'FFB05A00' } },
  },
  suppressed: {
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF7E0' } },
    font: { color: { argb: 'FFB05A00' } },
  },
};

export interface ExportWorkbookResult {
  workbook: ExcelJS.Workbook;
  truncated: boolean;
  totalCount: number;
}

@Injectable()
export class AuditExportService {
  constructor(
    private readonly auditEventsRepository: AuditEventsRepository,
    private readonly configService: ConfigService,
  ) {}

  async generateExportWorkbook(
    query: ExportAuditLogsQueryDto,
  ): Promise<ExportWorkbookResult> {
    this.validateDateRange(query.from, query.to);

    const maxRows = this.configService.get<number>('app.exportMaxRows', 50000);

    const { rows, totalCount } = await this.auditEventsRepository.findForExport(
      {
        notificationId: query.notificationId,
        correlationId: query.correlationId,
        cycleId: query.cycleId,
        eventType: query.eventType,
        actor: query.actor,
        from: query.from,
        to: query.to,
        q: query.q,
      },
      maxRows,
    );

    const truncated = totalCount > maxRows;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Notification API — Audit Service';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Audit Logs');

    // Define columns
    worksheet.columns = [
      { header: 'Timestamp', key: 'createdAt', width: 22 },
      { header: 'Notification ID', key: 'notificationId', width: 38 },
      { header: 'Correlation ID', key: 'correlationId', width: 38 },
      { header: 'Cycle ID', key: 'cycleId', width: 38 },
      { header: 'Event Type', key: 'eventType', width: 28 },
      { header: 'Source (Actor)', key: 'actor', width: 24 },
      { header: 'Channel', key: 'channel', width: 14 },
      { header: 'Provider', key: 'provider', width: 16 },
      { header: 'Delivery Status', key: 'deliveryStatus', width: 18 },
      { header: 'Metadata', key: 'metadata', width: 50 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.style = HEADER_STYLE as ExcelJS.Style;
    });
    headerRow.commit();

    // Add data rows
    for (const row of rows) {
      const dataRow = worksheet.addRow({
        createdAt: row.createdAt,
        notificationId: row.notificationId ?? '',
        correlationId: row.correlationId ?? '',
        cycleId: row.cycleId ?? '',
        eventType: row.eventType,
        actor: row.actor,
        channel: row.channel ?? '',
        provider: row.provider ?? '',
        deliveryStatus: row.deliveryStatus ?? '',
        metadata: row.metadata ? JSON.stringify(row.metadata) : '',
      });

      // Color-code by delivery status
      const status = row.deliveryStatus?.toLowerCase();
      if (status && STATUS_STYLES[status]) {
        const style = STATUS_STYLES[status];
        dataRow.eachCell((cell) => {
          cell.fill = style.fill;
          cell.font = style.font;
        });
      }

      dataRow.commit();
    }

    // Truncation warning row
    if (truncated) {
      const warningRow = worksheet.addRow({
        createdAt: `⚠ Export truncated: showing ${maxRows.toLocaleString()} of ${totalCount.toLocaleString()} total rows. Narrow your date range for complete results.`,
      });
      worksheet.mergeCells(warningRow.number, 1, warningRow.number, 10);
      const warningCell = warningRow.getCell(1);
      warningCell.font = { bold: true, color: { argb: 'FFB05A00' } };
      warningCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF7E0' },
      };
      warningRow.commit();
    }

    return { workbook, truncated, totalCount };
  }

  private validateDateRange(from: string, to: string): void {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    const diffMs = toDate.getTime() - fromDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays > MAX_DATE_RANGE_DAYS) {
      throw createErrorResponse(
        'AUD-004',
        `Date range exceeds maximum of ${MAX_DATE_RANGE_DAYS} days`,
      );
    }
  }
}
