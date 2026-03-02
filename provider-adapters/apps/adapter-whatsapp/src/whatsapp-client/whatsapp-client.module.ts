import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WhatsAppClientService } from './whatsapp-client.service.js';

@Module({
  imports: [HttpModule.register({ timeout: 10000 })],
  providers: [WhatsAppClientService],
  exports: [WhatsAppClientService],
})
export class WhatsAppClientModule {}
