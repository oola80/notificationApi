import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DlqEntry } from './entities/dlq-entry.entity.js';
import { DlqEntriesRepository } from './dlq-entries.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([DlqEntry])],
  providers: [DlqEntriesRepository],
  exports: [DlqEntriesRepository],
})
export class DlqModule {}
