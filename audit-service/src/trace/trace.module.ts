import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { ReceiptsModule } from '../receipts/receipts.module.js';
import { TraceController } from './trace.controller.js';
import { TraceService } from './trace.service.js';

@Module({
  imports: [EventsModule, ReceiptsModule],
  controllers: [TraceController],
  providers: [TraceService],
})
export class TraceModule {}
