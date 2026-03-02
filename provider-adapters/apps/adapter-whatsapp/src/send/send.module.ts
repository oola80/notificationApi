import { Module } from '@nestjs/common';
import { WhatsAppClientModule } from '../whatsapp-client/whatsapp-client.module.js';
import { SendService } from './send.service.js';
import { ErrorClassifierService } from './error-classifier.service.js';
import { SendController } from './send.controller.js';

@Module({
  imports: [WhatsAppClientModule],
  controllers: [SendController],
  providers: [SendService, ErrorClassifierService],
  exports: [SendService],
})
export class SendModule {}
