import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './app.config.js';
import databaseConfig from './database.config.js';
import rabbitmqConfig from './rabbitmq.config.js';
import { validate } from './env.validation.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, rabbitmqConfig],
      validate,
    }),
  ],
})
export class AppConfigModule {}
