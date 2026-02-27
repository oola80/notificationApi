import { Controller, Get } from '@nestjs/common';
import { MailgunHealthService } from './mailgun-health.service.js';
import {
  AdapterHealthResponseDto,
  AdapterCapabilitiesResponseDto,
} from '@app/common';

@Controller()
export class HealthController {
  constructor(private readonly healthService: MailgunHealthService) {}

  @Get('health')
  async getHealth(): Promise<AdapterHealthResponseDto> {
    return this.healthService.getHealth();
  }

  @Get('capabilities')
  getCapabilities(): AdapterCapabilitiesResponseDto {
    return {
      providerId: 'mailgun',
      providerName: 'Mailgun',
      supportedChannels: ['email'],
      supportsAttachments: true,
      supportsMediaUrls: false,
      maxAttachmentSizeMb: 25,
      maxRecipientsPerRequest: 1000,
      webhookPath: '/webhooks/inbound',
    };
  }
}
