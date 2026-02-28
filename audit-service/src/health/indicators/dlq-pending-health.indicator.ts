import { Injectable } from '@nestjs/common';
import { DlqEntriesRepository } from '../../dlq/dlq-entries.repository.js';

@Injectable()
export class DlqPendingHealthIndicator {
  constructor(private readonly dlqRepo: DlqEntriesRepository) {}

  async check(): Promise<{ status: string; pending: number }> {
    try {
      const pending = await this.dlqRepo.countPending();
      return { status: 'ok', pending };
    } catch {
      return { status: 'error', pending: -1 };
    }
  }
}
