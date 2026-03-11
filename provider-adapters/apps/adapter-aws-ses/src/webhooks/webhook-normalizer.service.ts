import { Injectable, Logger } from '@nestjs/common';
import { WebhookEventDto, WebhookEventType } from '@app/common';
import type {
  SesNotification,
  SesMailHeader,
} from './interfaces/ses-webhook.interfaces.js';

const EVENT_TYPE_MAP: Record<string, WebhookEventType> = {
  Send: WebhookEventType.SENT,
  Delivery: WebhookEventType.DELIVERED,
  Complaint: WebhookEventType.COMPLAINED,
  Reject: WebhookEventType.FAILED,
  Open: WebhookEventType.OPENED,
  Click: WebhookEventType.CLICKED,
};

@Injectable()
export class WebhookNormalizerService {
  private readonly logger = new Logger(WebhookNormalizerService.name);

  normalize(notification: SesNotification): WebhookEventDto {
    const eventType = this.mapEventType(notification);
    const rawStatus = this.buildRawStatus(notification);
    const headers = notification.mail.headers ?? [];
    const recipients = this.extractRecipients(notification);

    return {
      providerId: 'aws-ses',
      providerName: 'Amazon SES',
      providerMessageId: notification.mail.messageId,
      eventType,
      rawStatus,
      notificationId: this.getHeaderValue(headers, 'X-Notification-Id'),
      correlationId: this.getHeaderValue(headers, 'X-Correlation-Id'),
      cycleId: this.getHeaderValue(headers, 'X-Cycle-Id'),
      recipientAddress: recipients[0] ?? '',
      timestamp: this.extractTimestamp(notification),
      metadata: this.buildMetadata(notification),
    };
  }

  private mapEventType(notification: SesNotification): WebhookEventType {
    // Bounce needs special handling for permanent vs transient
    if (notification.eventType === 'Bounce' && notification.bounce) {
      return notification.bounce.bounceType === 'Permanent'
        ? WebhookEventType.BOUNCED
        : WebhookEventType.TEMP_FAIL;
    }

    const mapped = EVENT_TYPE_MAP[notification.eventType];
    if (!mapped) {
      this.logger.warn(
        `Unknown SES event type: "${notification.eventType}" — using raw event as eventType`,
      );
      return notification.eventType as unknown as WebhookEventType;
    }

    return mapped;
  }

  private buildRawStatus(notification: SesNotification): string {
    if (notification.eventType === 'Bounce' && notification.bounce) {
      return `Bounce.${notification.bounce.bounceType}`;
    }
    return notification.eventType;
  }

  private extractRecipients(notification: SesNotification): string[] {
    if (notification.delivery?.recipients) {
      return notification.delivery.recipients;
    }
    if (notification.bounce?.bouncedRecipients) {
      return notification.bounce.bouncedRecipients.map((r) => r.emailAddress);
    }
    if (notification.complaint?.complainedRecipients) {
      return notification.complaint.complainedRecipients.map(
        (r) => r.emailAddress,
      );
    }
    return notification.mail.destination ?? [];
  }

  private extractTimestamp(notification: SesNotification): string {
    if (notification.delivery?.timestamp) {
      return new Date(notification.delivery.timestamp).toISOString();
    }
    if (notification.bounce?.timestamp) {
      return new Date(notification.bounce.timestamp).toISOString();
    }
    if (notification.complaint?.timestamp) {
      return new Date(notification.complaint.timestamp).toISOString();
    }
    if (notification.open?.timestamp) {
      return new Date(notification.open.timestamp).toISOString();
    }
    if (notification.click?.timestamp) {
      return new Date(notification.click.timestamp).toISOString();
    }
    return new Date(notification.mail.timestamp).toISOString();
  }

  private getHeaderValue(
    headers: SesMailHeader[],
    name: string,
  ): string {
    const header = headers.find(
      (h) => h.name.toLowerCase() === name.toLowerCase(),
    );
    return (header?.value ?? null) as any;
  }

  private buildMetadata(
    notification: SesNotification,
  ): Record<string, any> {
    const metadata: Record<string, any> = {};

    if (notification.delivery) {
      metadata.deliveryStatus = {
        smtpResponse: notification.delivery.smtpResponse,
        processingTimeMillis: notification.delivery.processingTimeMillis,
        reportingMTA: notification.delivery.reportingMTA,
        remoteMtaIp: notification.delivery.remoteMtaIp,
      };
      metadata.recipients = notification.delivery.recipients;
    }

    if (notification.bounce) {
      metadata.bounceType = notification.bounce.bounceType;
      metadata.bounceSubType = notification.bounce.bounceSubType;
      metadata.reportingMTA = notification.bounce.reportingMTA;
      metadata.recipients = notification.bounce.bouncedRecipients.map(
        (r) => ({
          emailAddress: r.emailAddress,
          action: r.action,
          status: r.status,
          diagnosticCode: r.diagnosticCode,
        }),
      );
      if (notification.bounce.bouncedRecipients[0]?.diagnosticCode) {
        metadata.diagnosticCode =
          notification.bounce.bouncedRecipients[0].diagnosticCode;
      }
    }

    if (notification.complaint) {
      metadata.complaintFeedbackType =
        notification.complaint.complaintFeedbackType;
      metadata.userAgent = notification.complaint.userAgent;
      metadata.recipients = notification.complaint.complainedRecipients.map(
        (r) => r.emailAddress,
      );
    }

    if (notification.reject) {
      metadata.rejectReason = notification.reject.reason;
    }

    if (notification.open) {
      metadata.userAgent = notification.open.userAgent;
      metadata.ipAddress = notification.open.ipAddress;
    }

    if (notification.click) {
      metadata.clickUrl = notification.click.link;
      metadata.userAgent = notification.click.userAgent;
      metadata.ipAddress = notification.click.ipAddress;
    }

    metadata.timestamp = this.extractTimestamp(notification);

    return metadata;
  }
}
