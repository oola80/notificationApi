import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEvent } from './entities/audit-event.entity.js';
import { AuditEventsRepository } from './audit-events.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent])],
  providers: [AuditEventsRepository],
  exports: [AuditEventsRepository],
})
export class EventsModule {}
