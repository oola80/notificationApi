import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import brazeConfig from './braze.config.js';
import rabbitmqConfig from './rabbitmq.config.js';
import { validate } from './env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [brazeConfig, rabbitmqConfig],
      validate,
    }),
  ],
})
export class BrazeConfigModule {}
