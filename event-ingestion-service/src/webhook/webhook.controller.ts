import {
  Controller,
  Post,
  Body,
  UseGuards,
  Res,
  Headers,
} from '@nestjs/common';
import type { Response } from 'express';
import { WebhookService } from './webhook.service.js';
import { WebhookEventDto } from './dto/webhook-event.dto.js';
import { WebhookRateLimitGuard } from '../rate-limiter/guards/webhook-rate-limit.guard.js';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('events')
  @UseGuards(WebhookRateLimitGuard)
  async receiveEvent(
    @Body() dto: WebhookEventDto,
    @Res({ passthrough: true }) response: Response,
    @Headers('x-request-id') requestId?: string,
  ) {
    const correlationId = requestId || crypto.randomUUID();

    const result = await this.webhookService.processWebhookEvent(
      dto,
      null,
      correlationId,
    );

    if (result.status === 'duplicate') {
      response.status(200);
    } else {
      response.status(202);
    }

    return result;
  }
}
