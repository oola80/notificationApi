import { Module } from '@nestjs/common';
import { BrazeClientModule } from '../braze-client/braze-client.module.js';
import { HashingModule } from '../hashing/hashing.module.js';
import { ProfileSyncService } from './profile-sync.service.js';

@Module({
  imports: [BrazeClientModule, HashingModule],
  providers: [ProfileSyncService],
  exports: [ProfileSyncService],
})
export class ProfileSyncModule {}
