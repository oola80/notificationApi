import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SendRequestDto,
  SendResultDto,
  ChannelType,
  MetricsService,
} from '@app/common';
import { WhatsAppClientService } from '../whatsapp-client/whatsapp-client.service.js';
import type {
  WhatsAppMessage,
  WhatsAppTextMessage,
  WhatsAppTemplateMessage,
  WhatsAppMediaMessage,
  WhatsAppTemplateComponent,
} from '../whatsapp-client/interfaces/whatsapp.interfaces.js';
import { ErrorClassifierService } from './error-classifier.service.js';

const PROVIDER_ID = 'meta-whatsapp';
const CHANNEL = 'whatsapp';

@Injectable()
export class SendService {
  private readonly logger = new Logger(SendService.name);
  private readonly defaultTemplateLanguage: string;
  private readonly testMode: boolean;

  constructor(
    private readonly whatsappClient: WhatsAppClientService,
    private readonly errorClassifier: ErrorClassifierService,
    private readonly metricsService: MetricsService,
    private readonly configService: ConfigService,
  ) {
    this.defaultTemplateLanguage = this.configService.get<string>(
      'whatsapp.defaultTemplateLanguage',
      'en',
    );
    this.testMode = this.configService.get<boolean>(
      'whatsapp.testMode',
      false,
    );
  }

  async send(request: SendRequestDto): Promise<SendResultDto> {
    const startTime = Date.now();

    try {
      // Step 1: Validate channel is whatsapp
      if (request.channel !== ChannelType.WHATSAPP) {
        return {
          success: false,
          providerMessageId: null,
          retryable: false,
          errorMessage: `Unsupported channel: ${request.channel}. This adapter only supports whatsapp.`,
          httpStatus: 400,
          providerResponse: null,
        };
      }

      // Step 2: Format phone number (strip leading +)
      const to = this.formatPhoneNumber(request.recipient.address);

      // Step 3: Build Meta API message payload
      const message = this.buildMessage(request, to);

      // Step 4: Send via WhatsApp client
      const response = await this.whatsappClient.sendMessage(message);

      // Step 5: Extract provider message ID
      const providerMessageId = response.messages?.[0]?.id ?? null;

      // Step 6: Record metrics
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metricsService.incrementSend(PROVIDER_ID, CHANNEL, 'success');
      this.metricsService.observeSendDuration(
        PROVIDER_ID,
        CHANNEL,
        durationSeconds,
      );

      this.logger.log(
        `WhatsApp message sent successfully: ${providerMessageId}`,
      );

      return {
        success: true,
        providerMessageId,
        retryable: false,
        errorMessage: null,
        httpStatus: 200,
        providerResponse: response,
      };
    } catch (error) {
      const durationSeconds = (Date.now() - startTime) / 1000;
      const classified = this.errorClassifier.classifyError(error as Error);

      this.metricsService.incrementSend(PROVIDER_ID, CHANNEL, 'failure');
      this.metricsService.observeSendDuration(
        PROVIDER_ID,
        CHANNEL,
        durationSeconds,
      );
      this.metricsService.incrementSendErrors(
        PROVIDER_ID,
        CHANNEL,
        classified.errorCode,
      );

      this.logger.error(
        `WhatsApp send failed: ${classified.errorMessage} (${classified.errorCode}, retryable=${classified.retryable})`,
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

  private formatPhoneNumber(phone: string): string {
    return phone.startsWith('+') ? phone.slice(1) : phone;
  }

  private buildMessage(request: SendRequestDto, to: string): WhatsAppMessage {
    // Test mode: send static hello_world template, preserving only the 'to' number
    if (this.testMode) {
      this.logger.warn(
        `WHATSAPP_TEST_MODE is active — sending hello_world test template to ${to} instead of original message`,
      );
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: 'hello_world',
          language: { code: 'en_US' },
        },
      };
    }

    // Priority 1: Explicit template metadata from upstream pipeline
    if (request.metadata.templateName) {
      return this.buildTemplateFromMetadata(request, to);
    }

    // Priority 2: Legacy subject prefix detection (direct API calls)
    const subject = request.content.subject ?? '';
    if (subject.startsWith('template:')) {
      return this.buildTemplateMessage(request, to, subject);
    }

    // Priority 3: Media message
    const media = request.content.media;
    if (media && media.length > 0 && media[0].url) {
      return this.buildMediaMessage(request, to);
    }

    // Default: text message
    return this.buildTextMessage(to, request.content.body);
  }

  private buildTemplateFromMetadata(
    request: SendRequestDto,
    to: string,
  ): WhatsAppTemplateMessage {
    const templateName = request.metadata.templateName!;
    const languageCode =
      request.metadata.templateLanguage || this.defaultTemplateLanguage;

    const message: WhatsAppTemplateMessage = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    // Use explicit parameters if provided, otherwise try comma-separated body
    const params = request.metadata.templateParameters;
    if (params && params.length > 0) {
      message.template.components = [
        {
          type: 'body',
          parameters: params.map((param) => ({
            type: 'text' as const,
            parameter_name: param.name,
            text: param.value,
          })),
        },
      ];
    } else {
      const body = request.content.body?.trim();
      if (body) {
        const paramValues = body.split(',').map((v) => v.trim());
        message.template.components = [
          {
            type: 'body',
            parameters: paramValues.map((text) => ({ type: 'text', text })),
          },
        ];
      }
    }

    return message;
  }

  private buildTextMessage(to: string, body: string): WhatsAppTextMessage {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body },
    };
  }

  private buildTemplateMessage(
    request: SendRequestDto,
    to: string,
    subject: string,
  ): WhatsAppTemplateMessage {
    // Parse template info from subject: "template:name" or "template:name:language"
    const parts = subject.slice('template:'.length).split(':');
    const templateName = parts[0];
    const languageCode = parts[1] || this.defaultTemplateLanguage;

    const message: WhatsAppTemplateMessage = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
      },
    };

    // If body contains comma-separated parameters, add them as body components
    const body = request.content.body?.trim();
    if (body) {
      const paramValues = body.split(',').map((v) => v.trim());
      const components: WhatsAppTemplateComponent[] = [
        {
          type: 'body',
          parameters: paramValues.map((text) => ({ type: 'text', text })),
        },
      ];
      message.template.components = components;
    }

    return message;
  }

  private buildMediaMessage(
    request: SendRequestDto,
    to: string,
  ): WhatsAppMediaMessage {
    const mediaItem = request.content.media![0];
    const contentType = mediaItem.contentType?.toLowerCase() ?? '';
    const caption = request.content.body || undefined;

    if (contentType.startsWith('image/')) {
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link: mediaItem.url, caption },
      };
    }

    if (contentType.startsWith('video/')) {
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'video',
        video: { link: mediaItem.url, caption },
      };
    }

    // Default to document
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'document',
      document: {
        link: mediaItem.url,
        caption,
        filename: mediaItem.filename ?? undefined,
      },
    };
  }
}
