import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from './entities/audit-event.entity.js';
import { AuditEventsRepository } from './audit-events.repository.js';
import { AuditLogsController } from './audit-logs.controller.js';
import { AuditLogsService } from './audit-logs.service.js';
import { AuditExportService } from './audit-export.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent])],
  controllers: [AuditLogsController],
  providers: [AuditEventsRepository, AuditLogsService, AuditExportService],
  exports: [AuditEventsRepository],
})
export class EventsModule {}
