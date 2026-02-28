import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { EventIngestionClient } from './event-ingestion.client.js';

@Module({
  imports: [HttpModule],
  providers: [EventIngestionClient],
  exports: [EventIngestionClient],
})
export class EventIngestionModule {}
