import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AdapterClientService } from './adapter-client.service.js';

@Module({
  imports: [HttpModule],
  providers: [AdapterClientService],
  exports: [AdapterClientService],
})
export class AdapterClientModule {}
