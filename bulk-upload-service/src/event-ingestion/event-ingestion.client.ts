import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface SubmitEventPayload {
  sourceId: string;
  cycleId: string;
  eventType: string;
  sourceEventId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface SubmitEventResult {
  success: boolean;
  eventId?: string;
  error?: string;
  statusCode?: number;
}

@Injectable()
export class EventIngestionClient {
  private readonly logger = new Logger(EventIngestionClient.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'app.eventIngestionUrl',
      'http://localhost:3151',
    );
    this.timeoutMs = this.configService.get<number>(
      'app.workerRequestTimeoutMs',
      10000,
    );
  }

  async submitEvent(payload: SubmitEventPayload): Promise<SubmitEventResult> {
    const url = `${this.baseUrl}/api/v1/webhooks/events`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, payload, {
          timeout: this.timeoutMs,
        }),
      );

      const statusCode = response.status;
      if (statusCode >= 200 && statusCode < 300) {
        return {
          success: true,
          eventId: response.data?.eventId ?? response.data?.id,
          statusCode,
        };
      }

      return {
        success: false,
        error: `Unexpected status ${statusCode}`,
        statusCode,
      };
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  private handleError(error: any): SubmitEventResult {
    // Timeout
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return {
        success: false,
        error: `timeout after ${this.timeoutMs}ms`,
        statusCode: 408,
      };
    }

    // Connection error
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return {
        success: false,
        error: 'connection refused',
        statusCode: 503,
      };
    }

    // HTTP error response
    if (error.response) {
      const statusCode = error.response.status;
      const data = error.response.data;

      let errorMessage: string;
      if (statusCode >= 400 && statusCode < 500) {
        errorMessage =
          data?.message || data?.details || `HTTP ${statusCode} error`;
      } else {
        errorMessage = `HTTP ${statusCode} error`;
      }

      return {
        success: false,
        error: errorMessage,
        statusCode,
      };
    }

    // Unknown error
    return {
      success: false,
      error: error.message || 'Unknown error',
      statusCode: 500,
    };
  }
}
