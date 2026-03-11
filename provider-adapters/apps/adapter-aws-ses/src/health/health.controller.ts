import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SesHealthService } from './ses-health.service.js';
import {
  AdapterHealthResponseDto,
  AdapterCapabilitiesResponseDto,
} from '@app/common';

@Controller()
export class HealthController {
  constructor(
    private readonly healthService: SesHealthService,
    private readonly configService: ConfigService,
  ) {}

  @Get('health')
  async getHealth(): Promise<AdapterHealthResponseDto> {
    return this.healthService.getHealth();
  }

  @Get('capabilities')
  getCapabilities(): AdapterCapabilitiesResponseDto {
    const mode = this.configService.get<string>('ses.mode', 'smtp');

    return {
      providerId: 'aws-ses',
      providerName: 'Amazon SES',
      supportedChannels: ['email'],
      supportsAttachments: true,
      supportsMediaUrls: false,
      maxAttachmentSizeMb: mode === 'api' ? 10 : 40,
      maxRecipientsPerRequest: 50,
      webhookPath: '/webhooks/inbound',
    };
  }
}
