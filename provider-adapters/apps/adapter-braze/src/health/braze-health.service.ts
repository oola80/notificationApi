import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BaseHealthService } from '@app/common';

@Injectable()
export class BrazeHealthService extends BaseHealthService {
  private readonly logger = new Logger(BrazeHealthService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  getProviderId(): string {
    return 'braze';
  }

  getProviderName(): string {
    return 'Braze';
  }

  getSupportedChannels(): string[] {
    return ['email', 'sms', 'whatsapp', 'push'];
  }

  async checkProviderConnectivity(): Promise<{
    ok: boolean;
    latencyMs: number;
    details: Record<string, any>;
  }> {
    const restEndpoint = this.configService.get<string>(
      'braze.restEndpoint',
      '',
    );
    const apiKey = this.configService.get<string>('braze.apiKey', '');

    const start = Date.now();
    try {
      await firstValueFrom(
        this.httpService.get(
          `${restEndpoint}/email/hard_bounces?limit=0`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      const latencyMs = Date.now() - start;

      return {
        ok: true,
        latencyMs,
        details: {
          restEndpoint,
          channels: ['email', 'sms', 'whatsapp', 'push'],
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.logger.warn(
        `Braze health check failed: ${(error as Error).message}`,
      );

      return {
        ok: false,
        latencyMs,
        details: {
          restEndpoint,
          error: (error as Error).message,
        },
      };
    }
  }
}
