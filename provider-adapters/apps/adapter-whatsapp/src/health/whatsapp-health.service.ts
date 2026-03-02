import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHealthService } from '@app/common';
import { WhatsAppClientService } from '../whatsapp-client/whatsapp-client.service.js';

@Injectable()
export class WhatsAppHealthService extends BaseHealthService {
  private readonly logger = new Logger(WhatsAppHealthService.name);

  constructor(
    private readonly whatsappClient: WhatsAppClientService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  getProviderId(): string {
    return 'meta-whatsapp';
  }

  getProviderName(): string {
    return 'WhatsApp (Meta Cloud API)';
  }

  getSupportedChannels(): string[] {
    return ['whatsapp'];
  }

  async checkProviderConnectivity(): Promise<{
    ok: boolean;
    latencyMs: number;
    details: Record<string, any>;
  }> {
    const phoneNumberId = this.configService.get<string>(
      'whatsapp.phoneNumberId',
      '',
    );

    const start = Date.now();
    try {
      const response = await this.whatsappClient.getPhoneNumberInfo();
      const latencyMs = Date.now() - start;

      return {
        ok: true,
        latencyMs,
        details: {
          phoneNumberId,
          verifiedName: response?.verified_name ?? 'unknown',
          qualityRating: response?.quality_rating ?? 'unknown',
          apiVersion: this.configService.get<string>(
            'whatsapp.apiVersion',
            'v22.0',
          ),
        },
      };
    } catch (error) {
      const latencyMs = Date.now() - start;
      this.logger.warn(
        `WhatsApp health check failed: ${(error as Error).message}`,
      );

      return {
        ok: false,
        latencyMs,
        details: {
          phoneNumberId,
          error: (error as Error).message,
          apiVersion: this.configService.get<string>(
            'whatsapp.apiVersion',
            'v22.0',
          ),
        },
      };
    }
  }
}
