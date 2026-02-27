import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from './entities/channel.entity.js';
import { ChannelConfig } from './entities/channel-config.entity.js';
import { ChannelsRepository } from './channels.repository.js';
import { ChannelConfigsRepository } from './channel-configs.repository.js';
import { ChannelsService } from './channels.service.js';
import { ChannelsController } from './channels.controller.js';
import { ProvidersModule } from '../providers/providers.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Channel, ChannelConfig]),
    ProvidersModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelsRepository, ChannelConfigsRepository, ChannelsService],
  exports: [ChannelsRepository, ChannelConfigsRepository, ChannelsService],
})
export class ChannelsModule {}
