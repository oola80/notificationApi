import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SesClientModule } from '../ses-client/ses-client.module.js';
import { SendService } from './send.service.js';
import { ErrorClassifierService } from './error-classifier.service.js';
import { SendController } from './send.controller.js';

@Module({
  imports: [SesClientModule, HttpModule.register({ timeout: 5000 })],
  controllers: [SendController],
  providers: [SendService, ErrorClassifierService],
  exports: [SendService],
})
export class SendModule {}
