import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHealthService } from '@app/common';
import type { SesClientInterface } from '../ses-client/interfaces/ses.interfaces.js';
import { SES_CLIENT } from '../ses-client/interfaces/ses.interfaces.js';

@Injectable()
export class SesHealthService extends BaseHealthService {
  private readonly logger = new Logger(SesHealthService.name);

  constructor(
    @Inject(SES_CLIENT) private readonly sesClient: SesClientInterface,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  getProviderId(): string {
    return 'aws-ses';
  }

  getProviderName(): string {
    return 'Amazon SES';
  }

  getSupportedChannels(): string[] {
    return ['email'];
  }

  async checkProviderConnectivity(): Promise<{
    ok: boolean;
    latencyMs: number;
    details: Record<string, any>;
  }> {
    const region = this.configService.get<string>('ses.region', 'us-east-1');

    try {
      const result = await this.sesClient.checkConnectivity();

      return {
        ok: result.ok,
        latencyMs: result.latencyMs,
        details: {
          ...result.details,
          region,
        },
      };
    } catch (error) {
      this.logger.warn(
        `SES health check failed: ${(error as Error).message}`,
      );

      return {
        ok: false,
        latencyMs: 0,
        details: {
          region,
          mode: this.configService.get<string>('ses.mode', 'smtp'),
          error: (error as Error).message,
        },
      };
    }
  }
}
