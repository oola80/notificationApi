import { Module } from '@nestjs/common';
import { HashingService } from './hashing.service.js';
import { HashingController } from './hashing.controller.js';

@Module({
  controllers: [HashingController],
  providers: [HashingService],
  exports: [HashingService],
})
export class HashingModule {}
