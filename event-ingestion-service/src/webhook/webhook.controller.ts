import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  Res,
  Headers,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { WebhookService } from './webhook.service.js';
import { WebhookEventDto } from './dto/webhook-event.dto.js';
import { SourceAuthGuard } from './guards/source-auth.guard.js';
import { WebhookRateLimitGuard } from '../rate-limiter/guards/webhook-rate-limit.guard.js';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post('events')
  @UseGuards(SourceAuthGuard, WebhookRateLimitGuard)
  async receiveEvent(
    @Body() dto: WebhookEventDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('x-request-id') requestId?: string,
  ) {
    const correlationId = requestId || crypto.randomUUID();
    const eventSource = (request as any)['eventSource'];

    const result = await this.webhookService.processWebhookEvent(
      dto,
      eventSource,
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
