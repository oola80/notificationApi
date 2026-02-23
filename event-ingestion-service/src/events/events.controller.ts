import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { ListEventsQueryDto } from './dto/list-events-query.dto.js';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  findAll(@Query() query: ListEventsQueryDto) {
    return this.eventsService.findAll(query);
  }

  @Get(':eventId')
  findByEventId(@Param('eventId', new ParseUUIDPipe()) eventId: string) {
    return this.eventsService.findByEventId(eventId);
  }
}
