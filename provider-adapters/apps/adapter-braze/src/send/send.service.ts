import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SendRequestDto,
  SendResultDto,
  ChannelType,
  MetricsService,
} from '@app/common';
import { BrazeClientService } from '../braze-client/braze-client.service.js';
import { ProfileSyncService } from '../profile-sync/profile-sync.service.js';
import { ErrorClassifierService } from './error-classifier.service.js';
import {
  BrazeSendPayload,
  BrazeEmailMessage,
  BrazeSmsMessage,
  BrazeWhatsAppMessage,
  BrazeApplePushMessage,
  BrazeAndroidPushMessage,
} from '../braze-client/interfaces/braze.interfaces.js';

const SUPPORTED_CHANNELS = [
  ChannelType.EMAIL,
  ChannelType.SMS,
  ChannelType.WHATSAPP,
  ChannelType.PUSH,
];

@Injectable()
export class SendService {
  private readonly logger = new Logger(SendService.name);
  private readonly appId: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly smsSubscriptionGroup: string;
  private readonly whatsappSubscriptionGroup: string;

  constructor(
    private readonly brazeClient: BrazeClientService,
    private readonly profileSync: ProfileSyncService,
    private readonly errorClassifier: ErrorClassifierService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {
    this.appId = this.configService.get<string>('braze.appId', '');
    this.fromEmail = this.configService.get<string>('braze.fromEmail', '');
    this.fromName = this.configService.get<string>(
      'braze.fromName',
      'Notifications',
    );
    this.smsSubscriptionGroup = this.configService.get<string>(
      'braze.smsSubscriptionGroup',
      '',
    );
    this.whatsappSubscriptionGroup = this.configService.get<string>(
      'braze.whatsappSubscriptionGroup',
      '',
    );
  }

  async send(request: SendRequestDto): Promise<SendResultDto> {
    const startTime = Date.now();

    try {
      // Step 1: Validate channel
      if (!SUPPORTED_CHANNELS.includes(request.channel)) {
        return {
          success: false,
          providerMessageId: null,
          retryable: false,
          errorMessage: `Unsupported channel: ${request.channel}. Braze adapter currently supports: ${SUPPORTED_CHANNELS.join(', ')}.`,
          httpStatus: 400,
          providerResponse: null,
        };
      }

      // Step 2: Ensure profile (profile sync or pre-provisioned)
      const externalId = await this.profileSync.ensureProfile(
        request.recipient,
        request.channel,
      );

      // Step 3: Build channel-specific Braze payload
      const payload = this.buildPayload(request, externalId);

      // Step 4: Send via Braze API
      const response = await this.brazeClient.sendMessage(payload);

      // Step 5: Record metrics
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metricsService.incrementSend(
        'braze',
        request.channel,
        'success',
      );
      this.metricsService.observeSendDuration(
        'braze',
        request.channel,
        durationSeconds,
      );

      this.logger.log(
        `Message sent successfully via Braze (${request.channel}): ${response.dispatch_id}`,
      );

      return {
        success: true,
        providerMessageId: response.dispatch_id,
        retryable: false,
        errorMessage: null,
        httpStatus: 200,
        providerResponse: response,
      };
    } catch (error) {
      const durationSeconds = (Date.now() - startTime) / 1000;
      const classified = this.errorClassifier.classifyError(error as Error);

      this.metricsService.incrementSend(
        'braze',
        request.channel,
        'failure',
      );
      this.metricsService.observeSendDuration(
        'braze',
        request.channel,
        durationSeconds,
      );
      this.metricsService.incrementSendErrors(
        'braze',
        request.channel,
        classified.errorCode,
      );

      this.logger.error(
        `Send failed via Braze (${request.channel}): ${classified.errorMessage} (${classified.errorCode}, retryable=${classified.retryable})`,
      );

      return {
        success: false,
        providerMessageId: null,
        retryable: classified.retryable,
        errorMessage: classified.errorMessage,
        httpStatus: classified.httpStatus,
        providerResponse: null,
      };
    }
  }

  private buildPayload(
    request: SendRequestDto,
    externalId: string,
  ): BrazeSendPayload {
    const payload: BrazeSendPayload = {
      external_user_ids: [externalId],
      messages: {},
    };

    switch (request.channel) {
      case ChannelType.EMAIL:
        payload.messages.email = this.buildEmailMessage(request);
        break;
      case ChannelType.SMS:
        payload.messages.sms = this.buildSmsMessage(request);
        break;
      case ChannelType.WHATSAPP:
        payload.messages.whatsapp = this.buildWhatsAppMessage(request);
        break;
      case ChannelType.PUSH:
        payload.messages.apple_push = this.buildApplePushMessage(request);
        payload.messages.android_push = this.buildAndroidPushMessage(request);
        break;
    }

    return payload;
  }

  private buildEmailMessage(request: SendRequestDto): BrazeEmailMessage {
    const message: BrazeEmailMessage = {
      app_id: this.appId,
      subject: request.content.subject ?? '',
      body: request.content.htmlBody ?? request.content.body,
      from: `${this.fromName} <${this.fromEmail}>`,
    };

    // Attachments from media
    if (request.content.media && request.content.media.length > 0) {
      message.attachments = request.content.media.map((m) => ({
        file_name: m.filename ?? 'attachment',
        url: m.url,
      }));
    }

    // Extras for tracking
    if (request.metadata) {
      message.extras = {};
      if (request.metadata.notificationId) {
        message.extras.notificationId = request.metadata.notificationId;
      }
      if (request.metadata.correlationId) {
        message.extras.correlationId = request.metadata.correlationId;
      }
    }

    return message;
  }

  private buildSmsMessage(request: SendRequestDto): BrazeSmsMessage {
    if (!this.smsSubscriptionGroup) {
      const error = new Error(
        'SMS subscription group ID is required but not configured',
      ) as any;
      error.isMissingConfig = true;
      throw error;
    }

    const message: BrazeSmsMessage = {
      app_id: this.appId,
      subscription_group_id: this.smsSubscriptionGroup,
      body: request.content.body,
    };

    // MMS media items
    if (request.content.media && request.content.media.length > 0) {
      message.media_items = request.content.media.map((m) => ({
        url: m.url,
        content_type: m.contentType,
      }));
    }

    return message;
  }

  private buildWhatsAppMessage(request: SendRequestDto): BrazeWhatsAppMessage {
    if (!this.whatsappSubscriptionGroup) {
      const error = new Error(
        'WhatsApp subscription group ID is required but not configured',
      ) as any;
      error.isMissingConfig = true;
      throw error;
    }

    const message: BrazeWhatsAppMessage = {
      app_id: this.appId,
      subscription_group_id: this.whatsappSubscriptionGroup,
      message_type: 'template_message',
      message: {},
    };

    // Template fields from metadata
    if (request.metadata?.templateName) {
      message.message.template_name = request.metadata.templateName;
    }
    if (request.metadata?.templateLanguage) {
      message.message.template_language_code =
        request.metadata.templateLanguage;
    }

    // Template parameters → Braze variables format
    if (
      request.metadata?.templateParameters &&
      request.metadata.templateParameters.length > 0
    ) {
      message.message.variables = request.metadata.templateParameters.map(
        (p) => ({
          key: p.name,
          value: p.value,
        }),
      );
    }

    // Media header (IMAGE only — Braze API limitation)
    if (
      request.content.media &&
      request.content.media.length > 0 &&
      request.content.media[0].contentType?.startsWith('image/')
    ) {
      message.message.header = {
        type: 'IMAGE',
        url: request.content.media[0].url,
      };
    }

    return message;
  }

  private buildApplePushMessage(
    request: SendRequestDto,
  ): BrazeApplePushMessage {
    const message: BrazeApplePushMessage = {
      app_id: this.appId,
      alert: {
        title: request.content.subject ?? '',
        body: request.content.body,
      },
    };

    if (request.content.media && request.content.media.length > 0) {
      message.mutable_content = true;
      message.media_url = request.content.media[0].url;
    }

    return message;
  }

  private buildAndroidPushMessage(
    request: SendRequestDto,
  ): BrazeAndroidPushMessage {
    const message: BrazeAndroidPushMessage = {
      app_id: this.appId,
      title: request.content.subject ?? '',
      alert: request.content.body,
    };

    if (request.content.media && request.content.media.length > 0) {
      message.image_url = request.content.media[0].url;
    }

    return message;
  }
}
