import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MailgunClientModule } from '../mailgun-client/mailgun-client.module.js';
import { SendService } from './send.service.js';
import { ErrorClassifierService } from './error-classifier.service.js';
import { SendController } from './send.controller.js';

@Module({
  imports: [MailgunClientModule, HttpModule.register({ timeout: 5000 })],
  controllers: [SendController],
  providers: [SendService, ErrorClassifierService],
  exports: [SendService],
})
export class SendModule {}
