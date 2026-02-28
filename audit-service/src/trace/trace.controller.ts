import { Controller, Get, Param } from '@nestjs/common';
import { TraceService } from './trace.service.js';

@Controller('audit/trace')
export class TraceController {
  constructor(private readonly traceService: TraceService) {}

  @Get('correlation/:correlationId')
  traceByCorrelationId(@Param('correlationId') correlationId: string) {
    return this.traceService.traceByCorrelationId(correlationId);
  }

  @Get('cycle/:cycleId')
  traceByCycleId(@Param('cycleId') cycleId: string) {
    return this.traceService.traceByCycleId(cycleId);
  }

  @Get(':notificationId')
  traceByNotificationId(@Param('notificationId') notificationId: string) {
    return this.traceService.traceByNotificationId(notificationId);
  }
}
