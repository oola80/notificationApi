import { Module } from '@nestjs/common';
import { SesSmtpClientService } from './ses-smtp-client.service.js';
import { SesApiClientService } from './ses-api-client.service.js';
import { SesClientFactoryService } from './ses-client-factory.service.js';
import { SES_CLIENT } from './interfaces/ses.interfaces.js';

@Module({
  providers: [
    SesSmtpClientService,
    SesApiClientService,
    SesClientFactoryService,
    {
      provide: SES_CLIENT,
      useFactory: (factory: SesClientFactoryService) => factory.getClient(),
      inject: [SesClientFactoryService],
    },
  ],
  exports: [SES_CLIENT, SesClientFactoryService],
})
export class SesClientModule {}
