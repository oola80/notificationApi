import { Injectable } from '@nestjs/common';
import {
  EventProcessingService,
  EventProcessingInput,
} from '../consumers/event-processing.service.js';
import { WebhookEventDto } from './dto/webhook-event.dto.js';
export interface WebhookResult {
  eventId: string;
  correlationId: string;
  status: string;
}

@Injectable()
export class WebhookService {
  constructor(
    private readonly eventProcessingService: EventProcessingService,
  ) {}

  async processWebhookEvent(
    dto: WebhookEventDto,
    _eventSource: unknown,
    correlationId: string,
  ): Promise<WebhookResult> {
    const input: EventProcessingInput = {
      sourceId: dto.sourceId,
      cycleId: dto.cycleId,
      eventType: dto.eventType,
      sourceEventId: dto.sourceEventId,
      timestamp: dto.timestamp,
      payload: dto.payload,
      correlationId,
    };

    return this.eventProcessingService.processEvent(input);
  }
}
