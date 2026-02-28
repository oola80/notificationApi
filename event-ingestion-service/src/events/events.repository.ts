import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PgBaseRepository } from '../common/base/pg-base.repository.js';
import { Event } from './entities/event.entity.js';

export interface CreateEventResult {
  event: Event | null;
  isDuplicate: boolean;
}

@Injectable()
export class EventsRepository extends PgBaseRepository<Event> {
  constructor(
    @InjectRepository(Event)
    repository: Repository<Event>,
  ) {
    super(repository);
  }

  async createEvent(data: Partial<Event>): Promise<CreateEventResult> {
    if (!data.sourceEventId) {
      const entity = this.repository.create(data);
      const event = await this.repository.save(entity);
      return { event, isDuplicate: false };
    }

    const result: any[] = await this.repository.query(
      `INSERT INTO event_ingestion_service.events
        (event_id, source_id, cycle_id, event_type, source_event_id,
         raw_payload, normalized_payload, status, correlation_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (source_id, source_event_id) WHERE source_event_id IS NOT NULL
      DO NOTHING
      RETURNING *`,
      [
        data.eventId,
        data.sourceId,
        data.cycleId,
        data.eventType,
        data.sourceEventId,
        JSON.stringify(data.rawPayload),
        JSON.stringify(data.normalizedPayload),
        data.status,
        data.correlationId,
      ],
    );

    if (result.length === 0) {
      return { event: null, isDuplicate: true };
    }

    const row = result[0];
    const event = this.repository.create({
      id: row.id,
      eventId: row.event_id,
      sourceId: row.source_id,
      cycleId: row.cycle_id,
      eventType: row.event_type,
      sourceEventId: row.source_event_id,
      rawPayload: row.raw_payload,
      normalizedPayload: row.normalized_payload,
      status: row.status,
      errorMessage: row.error_message,
      correlationId: row.correlation_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });

    return { event, isDuplicate: false };
  }

  async findByEventId(eventId: string): Promise<Event | null> {
    return this.repository.findOne({ where: { eventId } });
  }

  async findDuplicate(
    sourceId: string,
    sourceEventId: string,
    windowHours: number,
  ): Promise<Event | null> {
    return this.repository
      .createQueryBuilder('event')
      .where('event.source_id = :sourceId', { sourceId })
      .andWhere('event.source_event_id = :sourceEventId', { sourceEventId })
      .andWhere(
        "event.created_at > NOW() - INTERVAL '1 hour' * :hours",
        { hours: windowHours },
      )
      .getOne();
  }

  async save(entity: Event): Promise<Event> {
    return this.repository.save(entity);
  }
}
