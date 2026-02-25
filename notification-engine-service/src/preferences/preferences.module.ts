import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerChannelPreference } from './entities/customer-channel-preference.entity.js';
import { CustomerPreferencesRepository } from './customer-preferences.repository.js';
import { CustomerPreferencesService } from './customer-preferences.service.js';
import { CustomerPreferencesController } from './customer-preferences.controller.js';
import { PreferenceCacheService } from './preference-cache.service.js';
import { PreferenceWebhookGuard } from './guards/preference-webhook.guard.js';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerChannelPreference])],
  controllers: [CustomerPreferencesController],
  providers: [
    CustomerPreferencesRepository,
    CustomerPreferencesService,
    PreferenceCacheService,
    PreferenceWebhookGuard,
  ],
  exports: [CustomerPreferencesService, PreferenceCacheService],
})
export class PreferencesModule {}
