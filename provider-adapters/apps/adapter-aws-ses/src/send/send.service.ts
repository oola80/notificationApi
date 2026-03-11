import { Injectable, Logger, Inject } from '@nestjs/common';
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
import type {
  SesSendOptions,
  SesAttachment,
  SesClientInterface,
} from '../ses-client/interfaces/ses.interfaces.js';
import { SES_CLIENT } from '../ses-client/interfaces/ses.interfaces.js';
import { ErrorClassifierService } from './error-classifier.service.js';

const MAX_ATTACHMENT_SIZE_BYTES_SMTP = 40 * 1024 * 1024; // 40 MB for SMTP mode
const MAX_ATTACHMENT_SIZE_BYTES_API = 10 * 1024 * 1024; // 10 MB for API mode

@Injectable()
export class SendService {
  private readonly logger = new Logger(SendService.name);
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly maxAttachmentSizeBytes: number;

  constructor(
    @Inject(SES_CLIENT) private readonly sesClient: SesClientInterface,
    private readonly errorClassifier: ErrorClassifierService,
    private readonly metricsService: MetricsService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.fromEmail = this.configService.get<string>('ses.fromEmail', '');
    this.fromName = this.configService.get<string>('ses.fromName', '');
    const mode = this.configService.get<string>('ses.mode', 'smtp');
    this.maxAttachmentSizeBytes =
      mode === 'api'
        ? MAX_ATTACHMENT_SIZE_BYTES_API
        : MAX_ATTACHMENT_SIZE_BYTES_SMTP;
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
          errorMessage: `Unsupported channel: ${request.channel}. AWS SES only supports email.`,
          httpStatus: 400,
          providerResponse: null,
        };
      }

      // Step 2: Process attachments
      const attachments = await this.processAttachments(
        request.content.media ?? [],
      );

      // Step 3: Build SES send options
      const sendOptions = this.buildSendOptions(request, attachments);

      // Step 4: Send via SES client (SMTP or API)
      const response = await this.sesClient.sendEmail(sendOptions);

      // Step 5: Extract provider message ID
      const providerMessageId = response.messageId;

      // Step 6: Record metrics
      const durationSeconds = (Date.now() - startTime) / 1000;
      this.metricsService.incrementSend('aws-ses', 'email', 'success');
      this.metricsService.observeSendDuration(
        'aws-ses',
        'email',
        durationSeconds,
      );

      this.logger.log(
        `Email sent successfully via AWS SES: ${providerMessageId}`,
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

      this.metricsService.incrementSend('aws-ses', 'email', 'failure');
      this.metricsService.observeSendDuration(
        'aws-ses',
        'email',
        durationSeconds,
      );
      this.metricsService.incrementSendErrors(
        'aws-ses',
        'email',
        classified.errorCode,
      );

      this.logger.error(
        `Email send failed via AWS SES: ${classified.errorMessage} (${classified.errorCode}, retryable=${classified.retryable})`,
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
    attachments: SesAttachment[],
  ): SesSendOptions {
    const fromEmail = request.fromAddress ?? this.fromEmail;
    const from = this.fromName
      ? `${this.fromName} <${fromEmail}>`
      : fromEmail;
    const to = request.recipient.name
      ? `${request.recipient.name} <${request.recipient.address}>`
      : request.recipient.address;

    const hasHtml = this.containsHtml(
      request.content.htmlBody ?? request.content.body,
    );

    const options: SesSendOptions = {
      from: request.fromAddress ? request.fromAddress : from,
      to,
      subject: request.content.subject,
      headers: {
        'X-Notification-Id': request.metadata.notificationId,
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
      options.headers!['X-Correlation-Id'] = request.metadata.correlationId;
    }

    if (request.metadata.cycleId) {
      options.headers!['X-Cycle-Id'] = request.metadata.cycleId;
    }

    if (request.replyTo) {
      options.replyTo = request.replyTo;
    }

    return options;
  }

  private containsHtml(body: string): boolean {
    return /<[a-z][\s\S]*>/i.test(body);
  }

  async processAttachments(media: MediaDto[]): Promise<SesAttachment[]> {
    const attachments: SesAttachment[] = [];

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
  ): Promise<SesAttachment | null> {
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

      const content = Buffer.from(response.data);

      const limitMb = this.maxAttachmentSizeBytes / (1024 * 1024);
      if (content.length > this.maxAttachmentSizeBytes) {
        this.logger.warn(
          `Attachment "${filename}" exceeds ${limitMb} MB limit (${content.length} bytes). Skipping.`,
        );
        return null;
      }

      return { filename, contentType, content };
    }

    // Base64 encoded data
    const content = Buffer.from(media.url, 'base64');

    const limitMb = this.maxAttachmentSizeBytes / (1024 * 1024);
    if (content.length > this.maxAttachmentSizeBytes) {
      this.logger.warn(
        `Attachment "${filename}" exceeds ${limitMb} MB limit (${content.length} bytes). Skipping.`,
      );
      return null;
    }

    return { filename, contentType, content };
  }

  private isUrl(value: string): boolean {
    return value.startsWith('http://') || value.startsWith('https://');
  }
}
