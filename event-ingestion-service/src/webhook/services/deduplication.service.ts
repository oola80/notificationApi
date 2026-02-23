import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventsRepository } from '../../events/events.repository.js';
import { Event } from '../../events/entities/event.entity.js';

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingEvent?: Event;
}

@Injectable()
export class DeduplicationService {
  constructor(
    private readonly eventsRepository: EventsRepository,
    private readonly configService: ConfigService,
  ) {}

  async checkDuplicate(
    sourceId: string,
    sourceEventId: string | null | undefined,
  ): Promise<DeduplicationResult> {
    if (!sourceEventId) {
      return { isDuplicate: false };
    }

    const windowHours = this.configService.get<number>(
      'app.dedupWindowHours',
      24,
    );

    const existingEvent = await this.eventsRepository.findDuplicate(
      sourceId,
      sourceEventId,
      windowHours,
    );

    if (existingEvent) {
      return { isDuplicate: true, existingEvent };
    }

    return { isDuplicate: false };
  }
}
