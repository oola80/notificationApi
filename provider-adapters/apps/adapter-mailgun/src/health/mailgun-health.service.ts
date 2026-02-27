import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHealthService } from '@app/common';
import { MailgunClientService } from '../mailgun-client/mailgun-client.service.js';

@Injectable()
export class MailgunHealthService extends BaseHealthService {
  private readonly logger = new Logger(MailgunHealthService.name);

  constructor(
    private readonly mailgunClient: MailgunClientService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  getProviderId(): string {
    return 'mailgun';
  }

  getProviderName(): string {
    return 'Mailgun';
  }

  getSupportedChannels(): string[] {
    return ['email'];
  }

  async checkProviderConnectivity(): Promise<{
    ok: boolean;
    latencyMs: number;
    details: Record<string, any>;
  }> {
    const domain = this.mailgunClient.getDomain();

    const start = Date.now();
    try {
      const response = await this.mailgunClient.getDomainInfo();
      const latencyMs = Date.now() - start;

      return {
        ok: true,
        latencyMs,
        details: {
          domain,
          state: response?.domain?.state ?? 'unknown',
          region: this.configService.get<string>('mailgun.region', 'us'),
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.logger.warn(
        `Mailgun health check failed: ${(error as Error).message}`,
      );

      return {
        ok: false,
        latencyMs,
        details: {
          domain,
          error: (error as Error).message,
          region: this.configService.get<string>('mailgun.region', 'us'),
        },
      };
    }
  }
}
