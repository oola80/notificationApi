import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SESv2Client,
  SendEmailCommand,
  GetAccountCommand,
} from '@aws-sdk/client-sesv2';
import {
  SesSendOptions,
  SesApiResponse,
  SesAccountInfo,
  SesSendResult,
  SesClientInterface,
} from './interfaces/ses.interfaces.js';

@Injectable()
export class SesApiClientService implements OnModuleInit, SesClientInterface {
  private readonly logger = new Logger(SesApiClientService.name);
  private client!: SESv2Client;

  private readonly region: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly configurationSet: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('ses.region', 'us-east-1');
    this.accessKeyId = this.configService.get<string>('ses.accessKeyId', '');
    this.secretAccessKey = this.configService.get<string>(
      'ses.secretAccessKey',
      '',
    );
    this.configurationSet = this.configService.get<string>(
      'ses.configurationSet',
      '',
    );
    this.timeoutMs = this.configService.get<number>('ses.timeoutMs', 10000);
  }

  onModuleInit() {
    const clientConfig: any = {
      region: this.region,
      requestHandler: {
        requestTimeout: this.timeoutMs,
      },
    };

    if (this.accessKeyId && this.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
      };
    }

    this.client = new SESv2Client(clientConfig);

    this.logger.log(
      `SES API client initialized: region=${this.region}${this.configurationSet ? `, configSet=${this.configurationSet}` : ''}`,
    );
  }

  async sendEmail(options: SesSendOptions): Promise<SesApiResponse> {
    this.logger.debug(`Sending email via SES API to ${options.to}`);

    const hasAttachments =
      options.attachments && options.attachments.length > 0;

    if (hasAttachments) {
      return this.sendRawEmail(options);
    }

    return this.sendSimpleEmail(options);
  }

  private async sendSimpleEmail(
    options: SesSendOptions,
  ): Promise<SesApiResponse> {
    const input: any = {
      FromEmailAddress: options.from,
      Destination: {
        ToAddresses: [options.to],
      },
      Content: {
        Simple: {
          Subject: {
            Data: options.subject || '',
            Charset: 'UTF-8',
          },
          Body: {},
        },
      },
    };

    if (options.html) {
      input.Content.Simple.Body.Html = {
        Data: options.html,
        Charset: 'UTF-8',
      };
    } else if (options.text) {
      input.Content.Simple.Body.Text = {
        Data: options.text,
        Charset: 'UTF-8',
      };
    }

    if (options.replyTo) {
      input.ReplyToAddresses = [options.replyTo];
    }

    if (this.configurationSet) {
      input.ConfigurationSetName = this.configurationSet;
    }

    if (options.headers) {
      input.EmailTags = Object.entries(options.headers)
        .filter(([key]) => key.startsWith('X-'))
        .map(([key, value]) => ({
          Name: key.replace('X-', '').replace(/-/g, ''),
          Value: value,
        }));
    }

    const command = new SendEmailCommand(input);
    const response = await this.client.send(command);

    return {
      messageId: response.MessageId || '',
    };
  }

  private async sendRawEmail(
    options: SesSendOptions,
  ): Promise<SesApiResponse> {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const mimeLines: string[] = [];

    // MIME headers
    mimeLines.push(`From: ${options.from}`);
    mimeLines.push(`To: ${options.to}`);
    mimeLines.push(`Subject: ${options.subject || ''}`);
    mimeLines.push('MIME-Version: 1.0');

    // Custom headers
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        mimeLines.push(`${key}: ${value}`);
      }
    }

    if (options.replyTo) {
      mimeLines.push(`Reply-To: ${options.replyTo}`);
    }

    mimeLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    mimeLines.push('');

    // Body part
    mimeLines.push(`--${boundary}`);
    if (options.html) {
      mimeLines.push('Content-Type: text/html; charset=UTF-8');
      mimeLines.push('Content-Transfer-Encoding: 7bit');
      mimeLines.push('');
      mimeLines.push(options.html);
    } else if (options.text) {
      mimeLines.push('Content-Type: text/plain; charset=UTF-8');
      mimeLines.push('Content-Transfer-Encoding: 7bit');
      mimeLines.push('');
      mimeLines.push(options.text);
    }

    // Attachment parts
    for (const att of options.attachments || []) {
      mimeLines.push(`--${boundary}`);
      mimeLines.push(
        `Content-Type: ${att.contentType}; name="${att.filename}"`,
      );
      mimeLines.push('Content-Transfer-Encoding: base64');
      mimeLines.push(
        `Content-Disposition: attachment; filename="${att.filename}"`,
      );
      mimeLines.push('');
      mimeLines.push(att.content.toString('base64'));
    }

    mimeLines.push(`--${boundary}--`);

    const rawMessage = mimeLines.join('\r\n');

    const input: any = {
      FromEmailAddress: options.from,
      Destination: {
        ToAddresses: [options.to],
      },
      Content: {
        Raw: {
          Data: Buffer.from(rawMessage),
        },
      },
    };

    if (this.configurationSet) {
      input.ConfigurationSetName = this.configurationSet;
    }

    const command = new SendEmailCommand(input);
    const response = await this.client.send(command);

    return {
      messageId: response.MessageId || '',
    };
  }

  async getAccountInfo(): Promise<SesAccountInfo> {
    const command = new GetAccountCommand({});
    const response = await this.client.send(command);

    return {
      maxSendRate: response.SendQuota?.MaxSendRate ?? 0,
      max24HourSend: response.SendQuota?.Max24HourSend ?? 0,
      sentLast24Hours: response.SendQuota?.SentLast24Hours ?? 0,
      sendingEnabled: response.SendingEnabled ?? false,
    };
  }

  async checkConnectivity(): Promise<{
    ok: boolean;
    latencyMs: number;
    details: Record<string, any>;
  }> {
    const start = Date.now();
    try {
      const accountInfo = await this.getAccountInfo();
      const latencyMs = Date.now() - start;

      return {
        ok: accountInfo.sendingEnabled,
        latencyMs,
        details: {
          region: this.region,
          mode: 'api',
          maxSendRate: accountInfo.maxSendRate,
          max24HourSend: accountInfo.max24HourSend,
          sentLast24Hours: accountInfo.sentLast24Hours,
          sendingEnabled: accountInfo.sendingEnabled,
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.logger.warn(
        `SES API health check failed: ${(error as Error).message}`,
      );

      return {
        ok: false,
        latencyMs,
        details: {
          region: this.region,
          mode: 'api',
          error: (error as Error).message,
        },
      };
    }
  }

  getRegion(): string {
    return this.region;
  }
}
