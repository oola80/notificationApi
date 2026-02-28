import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { AuditEvent } from './entities/audit-event.entity.js';

@Injectable()
export class AuditEventsRepository extends PgBaseRepository<AuditEvent> {
  constructor(
    @InjectRepository(AuditEvent)
    repository: Repository<AuditEvent>,
  ) {
    super(repository);
  }
}
