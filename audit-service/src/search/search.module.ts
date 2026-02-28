import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [EventsModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
