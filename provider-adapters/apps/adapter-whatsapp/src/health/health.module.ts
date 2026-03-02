import { Module } from '@nestjs/common';
import { WhatsAppClientModule } from '../whatsapp-client/whatsapp-client.module.js';
import { HealthController } from './health.controller.js';
import { WhatsAppHealthService } from './whatsapp-health.service.js';

@Module({
  imports: [WhatsAppClientModule],
  controllers: [HealthController],
  providers: [WhatsAppHealthService],
  exports: [WhatsAppHealthService],
})
export class HealthModule {}
