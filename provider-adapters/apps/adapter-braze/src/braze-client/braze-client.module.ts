import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { BrazeClientService } from './braze-client.service.js';

@Module({
  imports: [
    HttpModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: config.get<number>('braze.timeoutMs', 10000),
      }),
    }),
  ],
  providers: [BrazeClientService],
  exports: [BrazeClientService],
})
export class BrazeClientModule {}
