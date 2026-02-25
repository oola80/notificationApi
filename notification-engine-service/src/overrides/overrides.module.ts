import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CriticalChannelOverride } from './entities/critical-channel-override.entity.js';
import { CriticalChannelOverridesRepository } from './critical-channel-overrides.repository.js';
import { CriticalChannelOverridesService } from './critical-channel-overrides.service.js';
import { CriticalChannelOverridesController } from './critical-channel-overrides.controller.js';
import { OverrideCacheService } from './override-cache.service.js';
import { AppRabbitMQModule } from '../rabbitmq/rabbitmq.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CriticalChannelOverride]),
    AppRabbitMQModule,
  ],
  controllers: [CriticalChannelOverridesController],
  providers: [
    CriticalChannelOverridesRepository,
    CriticalChannelOverridesService,
    OverrideCacheService,
  ],
  exports: [CriticalChannelOverridesService, OverrideCacheService],
})
export class OverridesModule {}
