import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as https from 'https';
import { WhatsAppClientService } from './whatsapp-client.service.js';

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        timeout: 10000,
        httpsAgent: new https.Agent({
          rejectUnauthorized: configService.get<boolean>(
            'whatsapp.tlsRejectUnauthorized',
            true,
          ),
        }),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [WhatsAppClientService],
  exports: [WhatsAppClientService],
})
export class WhatsAppClientModule {}
