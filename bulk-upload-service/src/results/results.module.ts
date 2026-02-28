import { Module } from '@nestjs/common';
import { ResultsService } from './results.service.js';
import { UploadsModule } from '../uploads/uploads.module.js';

@Module({
  imports: [UploadsModule],
  providers: [ResultsService],
  exports: [ResultsService],
})
export class ResultsModule {}
