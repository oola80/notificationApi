import { Controller, Get, Patch, Post, Param, Query, Body } from '@nestjs/common';
import { DlqService } from './dlq.service.js';
import { ListDlqQueryDto } from './dto/list-dlq-query.dto.js';
import { UpdateDlqStatusDto } from './dto/update-dlq-status.dto.js';

@Controller('audit/dlq')
export class DlqController {
  constructor(private readonly dlqService: DlqService) {}

  @Get()
  findAll(@Query() query: ListDlqQueryDto) {
    return this.dlqService.findAll(query);
  }

  @Patch(':id')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDlqStatusDto,
  ) {
    return this.dlqService.updateStatus(id, dto);
  }

  @Post(':id/reprocess')
  reprocess(
    @Param('id') id: string,
    @Body() body: { resolvedBy?: string },
  ) {
    return this.dlqService.reprocess(id, body?.resolvedBy);
  }
}
