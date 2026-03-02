import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import whatsappConfig from './whatsapp.config.js';
import rabbitmqConfig from './rabbitmq.config.js';
import { validate } from './env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [whatsappConfig, rabbitmqConfig],
      validate,
    }),
  ],
})
export class WhatsAppConfigModule {}
