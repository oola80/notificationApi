import { Injectable, Logger } from '@nestjs/common';
import { WebhookEventDto, WebhookEventType } from '@app/common';
import type {
  BrazePostbackPayload,
  BrazeCurrentsEvent,
} from './interfaces/braze-webhook.interfaces.js';

/**
 * Maps Braze event_type strings to our normalized WebhookEventType.
 *
 * Email (6): Delivery, Bounce, Open, Click, SpamReport, Unsubscribe
 * SMS (3): Delivery, Rejection, InboundReceive
 * WhatsApp (4): Send, Delivery, Read, Failure
 * Push (2): Send, Open
 */
const EVENT_TYPE_MAP: Record<string, WebhookEventType> = {
  // Email events
  'users.messages.email.Delivery': WebhookEventType.DELIVERED,
  'users.messages.email.Bounce': WebhookEventType.BOUNCED,
  'users.messages.email.SoftBounce': WebhookEventType.TEMP_FAIL,
  'users.messages.email.Open': WebhookEventType.OPENED,
  'users.messages.email.Click': WebhookEventType.CLICKED,
  'users.messages.email.SpamReport': WebhookEventType.SPAM_COMPLAINT,
  'users.messages.email.Unsubscribe': WebhookEventType.UNSUBSCRIBED,

  // SMS events
  'users.messages.sms.Delivery': WebhookEventType.DELIVERED,
  'users.messages.sms.Rejection': WebhookEventType.BOUNCED,
  'users.messages.sms.InboundReceive': WebhookEventType.RECEIVED,

  // WhatsApp events
  'users.messages.whatsapp.Send': WebhookEventType.SENT,
  'users.messages.whatsapp.Delivery': WebhookEventType.DELIVERED,
  'users.messages.whatsapp.Read': WebhookEventType.READ,
  'users.messages.whatsapp.Failure': WebhookEventType.FAILED,

  // Push events
  'users.messages.pushnotification.Send': WebhookEventType.SENT,
  'users.messages.pushnotification.Open': WebhookEventType.OPENED,
};

@Injectable()
export class WebhookNormalizerService {
  private readonly logger = new Logger(WebhookNormalizerService.name);

  /**
   * Normalize a single Braze postback event to WebhookEventDto.
   * Returns null for unknown event types (caller should skip publishing).
   */
  normalizePostback(
    payload: BrazePostbackPayload,
  ): WebhookEventDto | null {
    return this.normalizeEvent(
      payload.event_type,
      payload.dispatch_id ?? payload.message_id ?? '',
      this.extractRecipientAddress(payload),
      payload.timestamp
        ? new Date(payload.timestamp).toISOString()
        : new Date().toISOString(),
      this.extractNotificationId(payload),
      this.extractCorrelationId(payload),
      this.extractCycleId(payload),
      {
        externalUserId: payload.external_user_id,
        sendId: payload.send_id,
        campaignId: payload.campaign_id,
        canvasStepId: payload.canvas_step_id,
      },
    );
  }

  /**
   * Normalize a single Braze Currents event to WebhookEventDto.
   * Returns null for unknown event types (caller should skip publishing).
   */
  normalizeCurrentsEvent(
    event: BrazeCurrentsEvent,
  ): WebhookEventDto | null {
    const timestamp = event.timestamp
      ? new Date(event.timestamp * 1000).toISOString()
      : new Date().toISOString();

    return this.normalizeEvent(
      event.event_type,
      event.dispatch_id ?? event.message_id ?? '',
      this.extractCurrentsRecipientAddress(event),
      timestamp,
      event.properties?.notificationId ?? null,
      event.properties?.correlationId ?? null,
      event.properties?.cycleId ?? null,
      {
        externalUserId: event.external_user_id,
        sendId: event.send_id,
        campaignId: event.campaign_id,
        canvasStepId: event.canvas_step_id,
      },
    );
  }

  private normalizeEvent(
    eventType: string,
    providerMessageId: string,
    recipientAddress: string,
    timestamp: string,
    notificationId: string | null,
    correlationId: string | null,
    cycleId: string | null,
    metadata: Record<string, any>,
  ): WebhookEventDto | null {
    const mappedType = EVENT_TYPE_MAP[eventType];

    if (!mappedType) {
      this.logger.warn(
        `Unknown Braze event type: "${eventType}" — skipping`,
      );
      return null;
    }

    // Clean metadata: remove undefined values
    const cleanMetadata: Record<string, any> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined && value !== null) {
        cleanMetadata[key] = value;
      }
    }

    return {
      providerId: 'braze',
      providerName: 'Braze',
      providerMessageId,
      eventType: mappedType,
      rawStatus: eventType,
      notificationId: notificationId ?? (null as any),
      correlationId: correlationId ?? (null as any),
      cycleId: cycleId ?? (null as any),
      recipientAddress,
      timestamp,
      metadata: cleanMetadata,
    };
  }

  private extractRecipientAddress(payload: BrazePostbackPayload): string {
    return (
      payload.email_address ??
      payload.phone_number ??
      payload.device_id ??
      ''
    );
  }

  private extractCurrentsRecipientAddress(
    event: BrazeCurrentsEvent,
  ): string {
    return (
      event.email_address ??
      event.phone_number ??
      event.device_id ??
      ''
    );
  }

  private extractNotificationId(
    payload: BrazePostbackPayload,
  ): string | null {
    return (
      payload.key_value_pairs?.notificationId ??
      payload.message_extras?.notificationId ??
      null
    );
  }

  private extractCorrelationId(
    payload: BrazePostbackPayload,
  ): string | null {
    return (
      payload.key_value_pairs?.correlationId ??
      payload.message_extras?.correlationId ??
      null
    );
  }

  private extractCycleId(payload: BrazePostbackPayload): string | null {
    return (
      payload.key_value_pairs?.cycleId ??
      payload.message_extras?.cycleId ??
      null
    );
  }
}
