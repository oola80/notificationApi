import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module.js';
import { FallbackService } from './fallback.service.js';

@Module({
  imports: [ChannelsModule],
  providers: [FallbackService],
  exports: [FallbackService],
})
export class FallbackModule {}
