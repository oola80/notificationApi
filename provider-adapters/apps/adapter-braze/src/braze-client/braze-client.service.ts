import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  BrazeSendPayload,
  BrazeSendResponse,
  BrazeTrackPayload,
  BrazeTrackResponse,
} from './interfaces/braze.interfaces.js';

@Injectable()
export class BrazeClientService {
  private readonly logger = new Logger(BrazeClientService.name);
  private readonly restEndpoint: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.restEndpoint = this.configService.get<string>(
      'braze.restEndpoint',
      '',
    );
    this.apiKey = this.configService.get<string>('braze.apiKey', '');
  }

  private getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  async sendMessage(payload: BrazeSendPayload): Promise<BrazeSendResponse> {
    const url = `${this.restEndpoint}/messages/send`;

    this.logger.debug(`Sending message to ${url}`);

    const response = await firstValueFrom(
      this.httpService.post<BrazeSendResponse>(url, payload, {
        headers: this.getAuthHeaders(),
      }),
    );

    const data = response.data;

    // Check for 201-with-errors (Braze returns 201 even when recipients fail)
    if (data.errors && data.errors.length > 0) {
      const error = new Error(
        `Braze send returned errors: ${data.errors.map((e) => e.message).join(', ')}`,
      ) as any;
      error.brazeErrors = data.errors;
      error.isBrazePartialError = true;
      throw error;
    }

    return data;
  }

  async trackUser(payload: BrazeTrackPayload): Promise<BrazeTrackResponse> {
    const url = `${this.restEndpoint}/users/track`;

    this.logger.debug(`Tracking user at ${url}`);

    const response = await firstValueFrom(
      this.httpService.post<BrazeTrackResponse>(url, payload, {
        headers: this.getAuthHeaders(),
      }),
    );

    return response.data;
  }
}
