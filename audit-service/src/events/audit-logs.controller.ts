import { Controller, Get, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { AuditLogsService } from './audit-logs.service.js';
import { AuditExportService } from './audit-export.service.js';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js';
import { ExportAuditLogsQueryDto } from './dto/export-audit-logs-query.dto.js';

@Controller('audit/logs')
export class AuditLogsController {
  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly auditExportService: AuditExportService,
  ) {}

  @Get('export')
  async exportXlsx(
    @Query() query: ExportAuditLogsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {

    const { workbook } = await this.auditExportService.generateExportWorkbook(query);

    const buffer = await workbook.xlsx.writeBuffer();

    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[:.]/g, '-');

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="audit-export-${timestamp}.xlsx"`,
    });

    return new StreamableFile(Buffer.from(buffer as ArrayBuffer));
  }

  @Get()
  findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.auditLogsService.findAll(query);
  }
}
