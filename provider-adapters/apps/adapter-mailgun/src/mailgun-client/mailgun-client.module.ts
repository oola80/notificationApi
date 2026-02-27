import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MailgunClientService } from './mailgun-client.service.js';

@Module({
  imports: [HttpModule.register({ timeout: 10000 })],
  providers: [MailgunClientService],
  exports: [MailgunClientService],
})
export class MailgunClientModule {}
