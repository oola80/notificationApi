import { Injectable } from '@nestjs/common';
import { FindOptionsWhere, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import { EventsRepository, CreateEventResult } from './events.repository.js';
import { Event } from './entities/event.entity.js';
import { ListEventsQueryDto } from './dto/list-events-query.dto.js';
import { createErrorResponse } from '../common/errors.js';
import { PaginatedResult } from '../common/base/pg-base.repository.js';

@Injectable()
export class EventsService {
  constructor(private readonly repository: EventsRepository) {}

  async findByEventId(eventId: string): Promise<Event> {
    const event = await this.repository.findByEventId(eventId);
    if (!event) {
      throw createErrorResponse('EIS-015');
    }
    return event;
  }

  async findAll(query: ListEventsQueryDto): Promise<PaginatedResult<Event>> {
    const where: FindOptionsWhere<Event> = {};

    if (query.sourceId) {
      where.sourceId = query.sourceId;
    }
    if (query.eventType) {
      where.eventType = query.eventType;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.from) {
      where.createdAt = MoreThanOrEqual(new Date(query.from));
    }
    if (query.to) {
      where.createdAt = LessThanOrEqual(new Date(query.to));
    }

    return this.repository.findWithPagination({
      where,
      page: query.page,
      limit: query.limit,
      order: { createdAt: 'DESC' },
    });
  }

  async createEvent(data: Partial<Event>): Promise<CreateEventResult> {
    return this.repository.createEvent(data);
  }

  async updateStatus(
    eventId: string,
    status: string,
    errorMessage?: string,
  ): Promise<Event> {
    const event = await this.repository.findByEventId(eventId);
    if (!event) {
      throw createErrorResponse('EIS-015');
    }
    event.status = status;
    if (errorMessage !== undefined) {
      event.errorMessage = errorMessage;
    }
    return this.repository.save(event);
  }
}
