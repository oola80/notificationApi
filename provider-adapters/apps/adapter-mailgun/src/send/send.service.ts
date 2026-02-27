import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  SendRequestDto,
  SendResultDto,
  ChannelType,
  MediaDto,
  MetricsService,
} from '@app/common';
import { MailgunClientService } from '../mailgun-client/mailgun-client.service.js';
import {
  MailgunSendOptions,
  MailgunAttachment,
} from '../mailgun-client/interfaces/mailgun.interfaces.js';
import { ErrorClassifierService } from './error-classifier.service.js';

const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

@Injectable()
export class SendService {
  private readonly logger = new Logger(SendService.name);
  private readonly fromAddress: string;

  constructor(
    private readonly mailgunClient: MailgunClientService,
    private readonly errorClassifier: ErrorClassifierService,
    private readonly metricsService: MetricsService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.fromAddress = this.configService.get<string>(
      'mailgun.fromAddress',
      'notifications@distelsa.info',
    );
  }

  async send(request: SendRequestDto): Promise<SendResultDto> {
    const startTime = Date.now();

    try {
      // Step 1: Validate channel is email
      if (request.channel !== ChannelType.EMAIL) {
        return {
          success: false,
          providerMessageId: null,
          retryable: false,
          errorMessage: `Unsupported channel: ${request.channel}. Mailgun only supports email.`,
          httpStatus: 400,
          providerResponse: null,
        };
      }

      // Step 2: Process attachments
      const attachments = await this.processAttachments(
        request.content.media ?? [],
      );

      // Step 3: Build Mailgun send options
      const sendOptions = this.buildSendOptions(request, attachments);

      // Step 4: Build form data and send
      const formData = this.mailgunClient.buildFormData(sendOptions);
      const response = await this.mailgunClient.sendMessage(formData);

      // Step 5: Extract provider message ID
      const providerMessageId = response.id;

      // Step 6: Record metrics
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metricsService.incrementSend('mailgun', 'email', 'success');
      this.metricsService.observeSendDuration(
        'mailgun',
        'email',
        durationSeconds,
      );

      this.logger.log(
        `Email sent successfully via Mailgun: ${providerMessageId}`,
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

      this.metricsService.incrementSend('mailgun', 'email', 'failure');
      this.metricsService.observeSendDuration(
        'mailgun',
        'email',
        durationSeconds,
      );
      this.metricsService.incrementSendErrors(
        'mailgun',
        'email',
        classified.errorCode,
      );

      this.logger.error(
        `Email send failed via Mailgun: ${classified.errorMessage} (${classified.errorCode}, retryable=${classified.retryable})`,
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

  private buildSendOptions(
    request: SendRequestDto,
    attachments: MailgunAttachment[],
  ): MailgunSendOptions {
    const from =
      request.fromAddress ?? this.fromAddress;
    const to = request.recipient.name
      ? `${request.recipient.name} <${request.recipient.address}>`
      : request.recipient.address;

    const hasHtml = this.containsHtml(
      request.content.htmlBody ?? request.content.body,
    );

    const options: MailgunSendOptions = {
      from,
      to,
      subject: request.content.subject,
      headers: {
        'X-Notification-Id': request.metadata.notificationId,
      },
      customVariables: {
        notificationId: request.metadata.notificationId,
      },
      attachments,
    };

    if (request.content.htmlBody) {
      options.html = request.content.htmlBody;
    } else if (hasHtml) {
      options.html = request.content.body;
    } else {
      options.text = request.content.body;
    }

    if (request.metadata.correlationId) {
      options.customVariables!.correlationId =
        request.metadata.correlationId;
    }

    if (request.metadata.cycleId) {
      options.customVariables!.cycleId = request.metadata.cycleId;
    }

    if (request.replyTo) {
      options.headers!['Reply-To'] = request.replyTo;
    }

    return options;
  }

  private containsHtml(body: string): boolean {
    return /<[a-z][\s\S]*>/i.test(body);
  }

  async processAttachments(
    media: MediaDto[],
  ): Promise<MailgunAttachment[]> {
    const attachments: MailgunAttachment[] = [];

    for (const item of media) {
      try {
        const attachment = await this.processOneAttachment(item);
        if (attachment) {
          attachments.push(attachment);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to process attachment "${item.filename ?? 'unknown'}": ${(error as Error).message}. Skipping.`,
        );
      }
    }

    return attachments;
  }

  private async processOneAttachment(
    media: MediaDto,
  ): Promise<MailgunAttachment | null> {
    const filename = media.filename ?? 'attachment';
    const contentType = media.contentType;

    if (this.isUrl(media.url)) {
      // Download from URL
      const response = await firstValueFrom(
        this.httpService.get(media.url, {
          responseType: 'arraybuffer',
          timeout: 5000,
        }),
      );

      const data = Buffer.from(response.data);

      if (data.length > MAX_ATTACHMENT_SIZE_BYTES) {
        this.logger.warn(
          `Attachment "${filename}" exceeds 25 MB limit (${data.length} bytes). Skipping.`,
        );
        return null;
      }

      return { filename, contentType, data };
    }

    // Base64 encoded data
    const data = Buffer.from(media.url, 'base64');

    if (data.length > MAX_ATTACHMENT_SIZE_BYTES) {
      this.logger.warn(
        `Attachment "${filename}" exceeds 25 MB limit (${data.length} bytes). Skipping.`,
      );
      return null;
    }

    return { filename, contentType, data };
  }

  private isUrl(value: string): boolean {
    return value.startsWith('http://') || value.startsWith('https://');
  }
}
