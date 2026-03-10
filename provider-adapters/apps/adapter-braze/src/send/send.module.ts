import { Module } from '@nestjs/common';
import { BrazeClientModule } from '../braze-client/braze-client.module.js';
import { ProfileSyncModule } from '../profile-sync/profile-sync.module.js';
import { SendService } from './send.service.js';
import { ErrorClassifierService } from './error-classifier.service.js';
import { SendController } from './send.controller.js';

@Module({
  imports: [BrazeClientModule, ProfileSyncModule],
  controllers: [SendController],
  providers: [SendService, ErrorClassifierService],
  exports: [SendService],
})
export class SendModule {}
