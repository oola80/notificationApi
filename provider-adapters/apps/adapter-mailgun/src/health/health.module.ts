import { Module } from '@nestjs/common';
import { MailgunClientModule } from '../mailgun-client/mailgun-client.module.js';
import { HealthController } from './health.controller.js';
import { MailgunHealthService } from './mailgun-health.service.js';

@Module({
  imports: [MailgunClientModule],
  controllers: [HealthController],
  providers: [MailgunHealthService],
  exports: [MailgunHealthService],
})
export class HealthModule {}
