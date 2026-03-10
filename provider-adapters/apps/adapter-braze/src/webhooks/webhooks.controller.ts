import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';
import type { BrazeWebhookPayload } from './interfaces/braze-webhook.interfaces.js';

@Controller()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * POST /webhooks/inbound
   *
   * Always returns 200 to stop Braze retries, even on verification failure.
   * Verification failures are logged and metrics recorded by the service.
   */
  @Post('webhooks/inbound')
  @HttpCode(200)
  async handleInbound(
    @Headers('x-braze-webhook-key') webhookKey: string | undefined,
    @Body() payload: BrazeWebhookPayload,
  ): Promise<{ status: string }> {
    try {
      await this.webhooksService.processWebhook(webhookKey, payload);
    } catch (error) {
      // Fire-and-forget: never throw, always return 200
      this.logger.error(
        `Unexpected error processing Braze webhook: ${(error as Error).message}`,
      );
    }

    return { status: 'ok' };
  }
}
