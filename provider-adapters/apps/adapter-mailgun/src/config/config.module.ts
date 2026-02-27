import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import mailgunConfig from './mailgun.config.js';
import rabbitmqConfig from './rabbitmq.config.js';
import { validate } from './env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [mailgunConfig, rabbitmqConfig],
      validate,
    }),
  ],
})
export class MailgunConfigModule {}
