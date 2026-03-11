import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import sesConfig from './ses.config.js';
import rabbitmqConfig from './rabbitmq.config.js';
import { validate } from './env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [sesConfig, rabbitmqConfig],
      validate,
    }),
  ],
})
export class SesConfigModule {}
