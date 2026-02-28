import {
  Controller,
  Post,
  Body,
  HttpCode,
  Logger,
  HttpException,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';
import type { MailgunWebhookPayload } from './interfaces/mailgun-webhook.interfaces.js';

@Controller()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('webhooks/inbound')
  @HttpCode(200)
  async handleInbound(
    @Body() payload: MailgunWebhookPayload,
  ): Promise<{ status: string }> {
    try {
      await this.webhooksService.processWebhook(payload);
      return { status: 'ok' };
    } catch (error) {
      // If verification fails, return 401
      if (error instanceof HttpException) {
        throw error;
      }

      // For any other error, return 200 (fire-and-forget — don't make Mailgun retry)
      this.logger.error(
        `Unexpected error processing webhook: ${(error as Error).message}`,
      );
      return { status: 'ok' };
    }
  }
}
