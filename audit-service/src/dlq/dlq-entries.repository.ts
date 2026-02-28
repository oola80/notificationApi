import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { DlqEntry, DlqEntryStatus } from './entities/dlq-entry.entity.js';

@Injectable()
export class DlqEntriesRepository extends PgBaseRepository<DlqEntry> {
  constructor(
    @InjectRepository(DlqEntry)
    repository: Repository<DlqEntry>,
  ) {
    super(repository);
  }

  async countPending(): Promise<number> {
    return this.repository.count({
      where: { status: DlqEntryStatus.PENDING },
    });
  }
}
