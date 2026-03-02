import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type {
  WhatsAppMessage,
  WhatsAppApiResponse,
} from './interfaces/whatsapp.interfaces.js';

@Injectable()
export class WhatsAppClientService {
  private readonly logger = new Logger(WhatsAppClientService.name);
  private readonly accessToken: string;
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.accessToken = this.configService.get<string>(
      'whatsapp.accessToken',
      '',
    );
    this.baseUrl = this.configService.get<string>('whatsapp.baseUrl', '');
  }

  async sendMessage(payload: WhatsAppMessage): Promise<WhatsAppApiResponse> {
    const url = `${this.baseUrl}/messages`;

    this.logger.debug(`Sending WhatsApp message to ${url}`);

    const response = await firstValueFrom(
      this.httpService.post<WhatsAppApiResponse>(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout: 10000,
      }),
    );

    return response.data;
  }

  async getPhoneNumberInfo(): Promise<any> {
    const url = this.baseUrl;

    const response = await firstValueFrom(
      this.httpService.get(url, {
        params: { fields: 'verified_name,quality_rating,platform_type' },
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout: 5000,
      }),
    );

    return response.data;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
