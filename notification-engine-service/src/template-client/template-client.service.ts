import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { createErrorResponse } from '../common/errors.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';

export interface TemplateRenderResult {
  channel: string;
  subject?: string;
  body: string;
  templateVersion?: number;
}

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MULTIPLIER = 3;

@Injectable()
export class TemplateClientService {
  private readonly logger = new Logger(TemplateClientService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  async render(
    templateId: string,
    channel: string,
    data: Record<string, any>,
  ): Promise<TemplateRenderResult> {
    return this.circuitBreakerService.execute(() =>
      this.executeRender(templateId, channel, data),
    );
  }

  private async executeRender(
    templateId: string,
    channel: string,
    data: Record<string, any>,
  ): Promise<TemplateRenderResult> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await firstValueFrom(
          this.httpService.post<TemplateRenderResult>(
            `/templates/${templateId}/render`,
            { channel, data },
          ),
        );
        return response.data;
      } catch (error) {
        const axiosError = error as AxiosError;
        lastError = error as Error;

        if (axiosError.response?.status === 404) {
          throw createErrorResponse(
            'NES-019',
            `Template ${templateId} not found`,
          );
        }

        const isServerError =
          axiosError.response && axiosError.response.status >= 500;
        const isTimeout =
          axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT';

        if (isServerError || isTimeout) {
          if (attempt < MAX_RETRIES - 1) {
            const delay =
              BACKOFF_BASE_MS * Math.pow(BACKOFF_MULTIPLIER, attempt);
            this.logger.warn(
              `Template render attempt ${attempt + 1} failed for ${templateId}, retrying in ${delay}ms`,
            );
            await this.delay(delay);
            continue;
          }
        }

        break;
      }
    }

    this.logger.error(
      `Template render failed after ${MAX_RETRIES} attempts for ${templateId}: ${lastError?.message}`,
    );
    throw createErrorResponse('NES-018');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
