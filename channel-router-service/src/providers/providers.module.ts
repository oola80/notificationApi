import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProviderConfig } from './entities/provider-config.entity.js';
import { ProviderConfigsRepository } from './provider-configs.repository.js';
import { ProviderCacheService } from './provider-cache.service.js';
import { ProvidersService } from './providers.service.js';
import { ProvidersController } from './providers.controller.js';
import { AdapterClientModule } from '../adapter-client/adapter-client.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProviderConfig]), AdapterClientModule],
  controllers: [ProvidersController],
  providers: [
    ProviderConfigsRepository,
    ProviderCacheService,
    ProvidersService,
  ],
  exports: [ProviderConfigsRepository, ProviderCacheService, ProvidersService],
})
export class ProvidersModule {}
