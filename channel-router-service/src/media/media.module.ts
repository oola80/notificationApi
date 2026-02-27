import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MediaProcessorService } from './media-processor.service.js';

@Module({
  imports: [HttpModule],
  providers: [MediaProcessorService],
  exports: [MediaProcessorService],
})
export class MediaModule {}
