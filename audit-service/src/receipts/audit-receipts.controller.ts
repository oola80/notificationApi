import { Controller, Get, Param } from '@nestjs/common';
import { AuditReceiptsService } from './audit-receipts.service.js';

@Controller('audit/receipts')
export class AuditReceiptsController {
  constructor(
    private readonly auditReceiptsService: AuditReceiptsService,
  ) {}

  @Get(':notificationId')
  getReceipts(@Param('notificationId') notificationId: string) {
    return this.auditReceiptsService.getReceiptsByNotificationId(
      notificationId,
    );
  }
}
