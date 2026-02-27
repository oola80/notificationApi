import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import FormData from 'form-data';
import {
  MailgunApiResponse,
  MailgunSendOptions,
} from './interfaces/mailgun.interfaces.js';

@Injectable()
export class MailgunClientService {
  private readonly logger = new Logger(MailgunClientService.name);
  private readonly apiKey: string;
  private readonly domain: string;
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiKey = this.configService.get<string>('mailgun.apiKey', '');
    this.domain = this.configService.get<string>(
      'mailgun.domain',
      'distelsa.info',
    );
    this.baseUrl = this.configService.get<string>(
      'mailgun.baseUrl',
      'https://api.mailgun.net/v3',
    );
  }

  private getAuthHeader(): string {
    return (
      'Basic ' + Buffer.from(`api:${this.apiKey}`).toString('base64')
    );
  }

  async sendMessage(formData: FormData): Promise<MailgunApiResponse> {
    const url = `${this.baseUrl}/${this.domain}/messages`;

    this.logger.debug(`Sending message to ${url}`);

    const response = await firstValueFrom(
      this.httpService.post<MailgunApiResponse>(url, formData, {
        headers: {
          ...formData.getHeaders(),
          Authorization: this.getAuthHeader(),
        },
        timeout: 10000,
      }),
    );

    return response.data;
  }

  async getDomainInfo(): Promise<any> {
    const url = `${this.baseUrl}/domains/${this.domain}`;

    const response = await firstValueFrom(
      this.httpService.get(url, {
        auth: { username: 'api', password: this.apiKey },
        timeout: 5000,
      }),
    );

    return response.data;
  }

  buildFormData(options: MailgunSendOptions): FormData {
    const formData = new FormData();

    formData.append('from', options.from);
    formData.append('to', options.to);

    if (options.subject) {
      formData.append('subject', options.subject);
    }

    if (options.html) {
      formData.append('html', options.html);
    } else if (options.text) {
      formData.append('text', options.text);
    }

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        formData.append(`h:${key}`, value);
      }
    }

    if (options.customVariables) {
      for (const [key, value] of Object.entries(options.customVariables)) {
        formData.append(`v:${key}`, value);
      }
    }

    if (options.attachments) {
      for (const attachment of options.attachments) {
        formData.append('attachment', attachment.data, {
          filename: attachment.filename,
          contentType: attachment.contentType,
        });
      }
    }

    return formData;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getDomain(): string {
    return this.domain;
  }
}
