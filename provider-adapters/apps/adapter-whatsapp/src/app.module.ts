import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { WhatsAppConfigModule } from './config/config.module.js';
import { MetricsModule, LoggingInterceptor } from '@app/common';
import { HealthModule } from './health/health.module.js';
import { SendModule } from './send/send.module.js';

@Module({
  imports: [
    WhatsAppConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          transport:
            config.get<string>('whatsapp.nodeEnv') !== 'production'
              ? { target: 'pino-pretty', options: { colorize: true } }
              : undefined,
          level:
            config.get<string>('whatsapp.nodeEnv') !== 'production'
              ? 'debug'
              : 'info',
        },
      }),
    }),
    MetricsModule,
    HealthModule,
    SendModule,
  ],
  providers: [LoggingInterceptor],
  exports: [LoggingInterceptor],
})
export class AppModule {}
