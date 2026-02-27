import { Injectable, Logger } from '@nestjs/common';
import { WebhookEventDto, WebhookEventType } from '@app/common';
import { MailgunWebhookPayload } from './interfaces/mailgun-webhook.interfaces.js';

const STATUS_MAP: Record<string, WebhookEventType> = {
  delivered: WebhookEventType.DELIVERED,
  opened: WebhookEventType.OPENED,
  clicked: WebhookEventType.CLICKED,
  complained: WebhookEventType.COMPLAINED,
  unsubscribed: WebhookEventType.UNSUBSCRIBED,
};

@Injectable()
export class WebhookNormalizerService {
  private readonly logger = new Logger(WebhookNormalizerService.name);

  normalize(payload: MailgunWebhookPayload): WebhookEventDto {
    const eventData = payload['event-data'];
    const rawEvent = eventData.event;
    const userVars = eventData['user-variables'] ?? {};

    // Map event type
    const eventType = this.mapEventType(rawEvent, eventData.severity);

    // Build rawStatus: for 'failed' events include severity
    const rawStatus =
      rawEvent === 'failed' && eventData.severity
        ? `${rawEvent}.${eventData.severity}`
        : rawEvent;

    // Build metadata with useful debugging info
    const metadata: Record<string, any> = {};
    if (eventData['delivery-status']) {
      metadata.deliveryStatus = eventData['delivery-status'];
    }
    if (eventData.severity) {
      metadata.severity = eventData.severity;
    }
    if (eventData.reason) {
      metadata.reason = eventData.reason;
    }
    if (eventData.ip) {
      metadata.ip = eventData.ip;
    }
    if (eventData.url) {
      metadata.url = eventData.url;
    }
    if (eventData.geolocation) {
      metadata.geolocation = eventData.geolocation;
    }

    return {
      providerId: 'mailgun',
      providerName: 'Mailgun',
      providerMessageId: eventData.message?.headers?.['message-id'] ?? '',
      eventType,
      rawStatus,
      notificationId: userVars['notificationId'] ?? null as any,
      correlationId: userVars['correlationId'] ?? null as any,
      cycleId: userVars['cycleId'] ?? null as any,
      recipientAddress: eventData.recipient,
      timestamp: new Date(eventData.timestamp * 1000).toISOString(),
      metadata,
    };
  }

  private mapEventType(
    event: string,
    severity?: string,
  ): WebhookEventType {
    // Handle 'failed' events based on severity
    if (event === 'failed') {
      if (severity === 'permanent') {
        return WebhookEventType.BOUNCED;
      }
      return WebhookEventType.FAILED;
    }

    const mapped = STATUS_MAP[event];
    if (!mapped) {
      this.logger.warn(
        `Unknown Mailgun event type: "${event}" — using raw event as eventType`,
      );
      return event as WebhookEventType;
    }

    return mapped;
  }
}
