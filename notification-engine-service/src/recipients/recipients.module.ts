import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecipientGroup } from './entities/recipient-group.entity.js';
import { RecipientGroupMember } from './entities/recipient-group-member.entity.js';
import { RecipientGroupsRepository } from './recipient-groups.repository.js';
import { RecipientGroupsService } from './recipient-groups.service.js';
import { RecipientGroupsController } from './recipient-groups.controller.js';
import { RecipientResolverService } from './recipient-resolver.service.js';
import { ChannelResolverService } from './channel-resolver.service.js';
import { PreferencesModule } from '../preferences/preferences.module.js';
import { OverridesModule } from '../overrides/overrides.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecipientGroup, RecipientGroupMember]),
    PreferencesModule,
    OverridesModule,
  ],
  controllers: [RecipientGroupsController],
  providers: [
    RecipientGroupsRepository,
    RecipientGroupsService,
    RecipientResolverService,
    ChannelResolverService,
  ],
  exports: [
    RecipientResolverService,
    ChannelResolverService,
    RecipientGroupsService,
  ],
})
export class RecipientsModule {}
