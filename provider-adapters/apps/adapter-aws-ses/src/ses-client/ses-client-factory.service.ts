import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SesSmtpClientService } from './ses-smtp-client.service.js';
import { SesApiClientService } from './ses-api-client.service.js';
import { SesClientInterface } from './interfaces/ses.interfaces.js';

@Injectable()
export class SesClientFactoryService {
  private readonly logger = new Logger(SesClientFactoryService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly smtpClient: SesSmtpClientService,
    private readonly apiClient: SesApiClientService,
  ) {}

  getClient(): SesClientInterface {
    const mode = this.configService.get<string>('ses.mode', 'smtp');

    if (mode === 'smtp') {
      this.logger.debug('Using SES SMTP client');
      return this.smtpClient;
    }

    if (mode === 'api') {
      this.logger.debug('Using SES API client');
      return this.apiClient;
    }

    throw new Error(
      `Invalid SES_MODE: "${mode}". Must be "smtp" or "api".`,
    );
  }
}
