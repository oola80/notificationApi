import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  SendRequest,
  SendResult,
  AdapterHealthResponse,
  AdapterCapabilitiesResponse,
} from './interfaces/adapter-client.interfaces.js';
import { MetricsService } from '../metrics/metrics.service.js';

@Injectable()
export class AdapterClientService {
  private readonly logger = new Logger(AdapterClientService.name);
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly metricsService: MetricsService,
  ) {
    this.timeoutMs = this.configService.get<number>(
      'app.adapterHttpTimeoutMs',
      10000,
    );
  }

  async send(adapterUrl: string, request: SendRequest): Promise<SendResult> {
    const url = `${adapterUrl}/send`;
    const start = Date.now();
    this.logger.log(`Sending to adapter: ${url}`);

    const adapterPayload = this.toAdapterPayload(request);

    try {
      const response = await firstValueFrom(
        this.httpService.post<SendResult>(url, adapterPayload, {
          timeout: this.timeoutMs,
        }),
      );

      const durationMs = Date.now() - start;
      this.logger.log(
        `Adapter send completed: ${url} status=${response.status} duration=${durationMs}ms`,
      );

      return response.data;
    } catch (error: any) {
      const durationMs = Date.now() - start;
      this.logger.error(
        `Adapter send failed: ${url} duration=${durationMs}ms error=${error.message}`,
      );

      return this.handleError(error);
    }
  }

  private toAdapterPayload(request: SendRequest): Record<string, any> {
    const address =
      request.recipient.email ||
      request.recipient.phone ||
      request.recipient.deviceToken ||
      '';

    const media = request.media?.map((m) => ({
      url: m.url || m.content || '',
      contentType: m.mimeType,
      filename: m.filename,
    }));

    return {
      channel: request.channel,
      recipient: {
        address,
        name: request.recipient.name,
      },
      content: {
        subject: request.content.subject,
        body: request.content.body,
        ...(media && media.length > 0 ? { media } : {}),
      },
      metadata: {
        notificationId: request.notificationId,
        correlationId: request.metadata?.correlationId,
        cycleId: request.metadata?.cycleId,
        priority: request.priority,
      },
    };
  }

  async checkHealth(adapterUrl: string): Promise<AdapterHealthResponse> {
    const url = `${adapterUrl}/health`;
    const start = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.get<AdapterHealthResponse>(url, {
          timeout: this.timeoutMs,
        }),
      );

      const durationMs = Date.now() - start;
      this.logger.debug(
        `Adapter health check: ${url} status=${response.data.status} duration=${durationMs}ms`,
      );

      return response.data;
    } catch (error: any) {
      const durationMs = Date.now() - start;
      this.logger.error(
        `Adapter health check failed: ${url} duration=${durationMs}ms error=${error.message}`,
      );
      throw error;
    }
  }

  async getCapabilities(
    adapterUrl: string,
  ): Promise<AdapterCapabilitiesResponse> {
    const url = `${adapterUrl}/capabilities`;
    const start = Date.now();

    try {
      const response = await firstValueFrom(
        this.httpService.get<AdapterCapabilitiesResponse>(url, {
          timeout: this.timeoutMs,
        }),
      );

      const durationMs = Date.now() - start;
      this.logger.log(
        `Adapter capabilities fetched: ${url} duration=${durationMs}ms`,
      );

      return response.data;
    } catch (error: any) {
      const durationMs = Date.now() - start;
      this.logger.error(
        `Adapter capabilities failed: ${url} duration=${durationMs}ms error=${error.message}`,
      );
      throw error;
    }
  }

  private handleError(error: any): SendResult {
    const isTimeout =
      error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    const isConnectionError =
      error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND';
    const httpStatus =
      error.response?.status ??
      (isTimeout ? 408 : isConnectionError ? 503 : 500);

    return {
      success: false,
      providerMessageId: null,
      retryable: httpStatus >= 500 || isTimeout || isConnectionError,
      errorMessage: error.message,
      httpStatus,
      providerResponse: error.response?.data ?? null,
    };
  }
}
