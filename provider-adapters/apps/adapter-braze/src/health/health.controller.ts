import { Controller, Get } from '@nestjs/common';
import { BrazeHealthService } from './braze-health.service.js';
import {
  AdapterHealthResponseDto,
  AdapterCapabilitiesResponseDto,
} from '@app/common';

@Controller()
export class HealthController {
  constructor(private readonly healthService: BrazeHealthService) {}

  @Get('health')
  async getHealth(): Promise<AdapterHealthResponseDto> {
    return this.healthService.getHealth();
  }

  @Get('capabilities')
  getCapabilities(): AdapterCapabilitiesResponseDto {
    return {
      providerId: 'braze',
      providerName: 'Braze',
      supportedChannels: ['email', 'sms', 'whatsapp', 'push'],
      supportsAttachments: false,
      supportsMediaUrls: true,
      maxAttachmentSizeMb: 0,
      maxRecipientsPerRequest: 50,
      webhookPath: '/webhooks/inbound',
    };
  }
}
