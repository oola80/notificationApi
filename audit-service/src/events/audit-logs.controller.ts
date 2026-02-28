import { Controller, Get, Query } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service.js';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto.js';

@Controller('audit/logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  findAll(@Query() query: ListAuditLogsQueryDto) {
    return this.auditLogsService.findAll(query);
  }
}
