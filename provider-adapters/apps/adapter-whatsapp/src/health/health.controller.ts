import { Controller, Get } from '@nestjs/common';
import { WhatsAppHealthService } from './whatsapp-health.service.js';
import {
  AdapterHealthResponseDto,
  AdapterCapabilitiesResponseDto,
} from '@app/common';

@Controller()
export class HealthController {
  constructor(private readonly healthService: WhatsAppHealthService) {}

  @Get('health')
  async getHealth(): Promise<AdapterHealthResponseDto> {
    return this.healthService.getHealth();
  }

  @Get('capabilities')
  getCapabilities(): AdapterCapabilitiesResponseDto {
    return {
      providerId: 'meta-whatsapp',
      providerName: 'WhatsApp (Meta Cloud API)',
      supportedChannels: ['whatsapp'],
      supportsAttachments: false,
      supportsMediaUrls: true,
      maxAttachmentSizeMb: 16,
      maxRecipientsPerRequest: 1,
      webhookPath: '/webhooks/inbound',
    };
  }
}
